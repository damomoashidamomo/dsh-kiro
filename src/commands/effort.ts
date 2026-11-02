import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { resolveEffortLevels, effortSourceLabel, type EffortLevels } from '../runtime/effort-levels'

const EFFORTS = ['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = typeof EFFORTS[number]

function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value)
}

/** Structural reads of the services this command coordinates. */
interface Services {
  readonly provider: string | undefined
  readonly model: string | undefined
  readonly declared: readonly string[] | undefined
  /** Provenance of the ladder: model declaration / provider default / inferred. */
  readonly source: 'model' | 'provider' | 'inferred' | undefined
  readonly current: string | undefined
  readonly apply: (level: string) => void
  readonly persist: (level: string) => void
  /** Return to keyword-auto mode (clear the manual pin). */
  readonly clearManual: () => void
  /** Live-test the gateway's reasoning_effort handling (/effort probe). */
  readonly probe: () => Promise<string>
}

function servicesOf(agentCtx: unknown): Services | undefined {
  const ctx = (agentCtx as { ctx?: unknown }).ctx
  if (ctx === undefined || ctx === null) return undefined
  const get = (ctx as { get?: (name: string) => unknown }).get
  if (typeof get !== 'function') return undefined

  const controller = get.call(ctx, 'kiroController') as
    | { getState?: () => { agent: { activeProvider?: string; activeModel?: string } } }
    | undefined
  const provider = controller?.getState?.().agent.activeProvider
  const model = controller?.getState?.().agent.activeModel

  // Level ladder: model declaration > provider-level default > name
  // heuristic (marked inferred — /effort probe verifies the real gateway).
  let levels: EffortLevels | undefined
  try {
    const settings = get.call(ctx, 'settings') as { get?: (ns: string) => unknown } | undefined
    const piAi = settings?.get?.('llm-pi-ai')
    levels = resolveEffortLevels(piAi as never, provider, model)
  } catch {
    levels = undefined
  }
  const declared = levels?.levels
  const source = levels?.source

  const switcher = get.call(ctx, 'kiroModelSwitch') as
    | { apply?: (next: unknown) => void }
    | undefined
  const effortControl = get.call(ctx, 'kiroEffortControl') as
    | {
        setManual?: (level: string) => void
        clearManual?: () => void
        current?: () => string | undefined
      }
    | undefined
  const defaultModel = get.call(ctx, 'agentDefaultModel') as
    | { saveSelection?: (next: unknown) => Promise<void> }
    | undefined

  const result: Services = {
    provider,
    model,
    declared,
    source,
    current: effortControl?.current?.(),
    apply: (level: string) => {
      switcher?.apply?.({ provider, model, reasoningEffort: level })
      effortControl?.setManual?.(level)
    },
    clearManual: () => {
      effortControl?.clearManual?.()
    },
    persist: (level: string) => {
      void defaultModel?.saveSelection?.({ provider, model, reasoningEffort: level })
    },
    probe: () => probe(),
  }
  return result

  /**
   * /effort probe — live-test the CURRENT model's gateway through the
   * runtime bridge (agent-scope ctx.get loses the llm receiver to a cordis
   * shadow proxy). Baseline request without the effort field, then with it.
   */
  async function probe(): Promise<string> {
    if (provider === undefined || model === undefined) return '/effort probe: 无法确定当前模型'
    const bridge = (get?.call(ctx, 'kiroEffortProbe') ?? undefined) as
      | { probe?: (provider: string, model: string) => Promise<string> }
      | undefined
    const raw = await bridge?.probe?.(provider, model)
    if (raw === undefined) return '/effort probe: 探测服务不可用'
    if (raw === '/effort probe: ok') {
      return [
        `/effort probe：${provider}/${model} 接受 reasoning_effort 字段（low 档请求成功）。`,
        levels?.source === 'inferred'
          ? '当前档位来自名称推断——已实测可用，建议在 settings 里固化声明。'
          : '与当前声明一致。',
      ].join('\n')
    }
    if (raw.startsWith('/effort probe: rejected: ')) {
      return [
        `/effort probe：${provider}/${model} 拒绝带 reasoning_effort 的请求：`,
        `  ${raw.slice('/effort probe: rejected: '.length)}`,
        '结论：该网关不转发思考档位——保持 /effort auto（不发送档位）即可正常使用。',
      ].join('\n')
    }
    return raw
  }
}

/**
 * `/effort` — set the reasoning depth the agent loop sends with every
 * request. Real wiring: persists through agentDefaultModel (survives
 * restarts) and live-applies through the same model-selection override
 * /model uses (next request). Levels are validated against the model's
 * DECLARED efforts — models without declarations report honestly instead
 * of accepting a dial they cannot turn.
 */
export const effortCommand: CommandDefinition = {
  name: 'effort',
  description: 'Set reasoning depth for this model: off | low | medium | high | xhigh | max',
  input: { hint: '<level>' },
  handler: async ({ agent, rawInput }) => {
    const candidate = rawInput.trim().toLowerCase()
    const services = servicesOf(agent)
    if (candidate === 'probe') {
      if (services === undefined) return { kind: 'error', text: '/effort probe: 服务不可用' }
      return { kind: 'success', text: await services.probe() }
    }
    if (candidate === '') {
      const lines = [`usage: /effort <${EFFORTS.join('|')}>  |  /effort probe 实测网关`]
      if (services?.declared !== undefined && services.provider !== undefined && services.model !== undefined) {
        lines.push(`当前模型 ${services.provider}/${services.model} 可用档位：${services.declared.join(' / ')}`)
        lines.push(`（来源：${effortSourceLabel(services.source ?? 'inferred')}）`)
      } else {
        lines.push('当前模型无法解析思考档位。')
      }
      lines.push('提示词里写「深入分析」「ultrathink」等短语也会按回合自动升档。')
      return { kind: 'success', text: lines.join('\n') }
    }

    // 'auto' = keyword-escalation mode: clear the manual pin. It is a TUI
    // dispatch mode, not a wire level — nothing is sent to the model.
    if (candidate === 'auto') {
      services?.clearManual?.()
      return { kind: 'success', text: '已回到自动模式：默认 low 基线，提示词关键词按回合升档。' }
    }

    if (services === undefined || services.provider === undefined || services.model === undefined) {
      return { kind: 'error', text: '/effort: 无法确定当前模型' }
    }
    if (services.declared === undefined) {
      return {
        kind: 'error',
        text: `${services.provider}/${services.model} 无法解析思考档位。`,
      }
    }
    if (!services.declared.includes(candidate)) {
      return {
        kind: 'error',
        text: `${services.model} 支持的档位：${services.declared.join(' / ')}（不含 ${candidate}）。`,
      }
    }

    services.apply(candidate)
    services.persist(candidate)
    return {
      kind: 'success',
      text: `思考档位已设为 ${candidate}（下一轮请求生效，重启后保持）。`,
    }
  },
}
