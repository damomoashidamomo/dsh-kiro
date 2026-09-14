/**
 * `/model` — pick the model the current session uses.
 *
 * Two flows:
 *
 * 1. Interactive (kiro-style): `/model` with no argument opens a list
 *    picker populated from the DSH configuration file (`llm-pi-ai.providers`
 *    in `~/.dsh/settings.yaml`). ↑/↓ selects, Enter confirms, Esc cancels.
 *
 * 2. Direct: `/model <provider>/<model>` sets the selection immediately.
 *
 * Either path persists through `agentDefaultModel.saveSelection` (writes the
 * `agent-default-model` settings scope so the next launch picks it up) and
 * updates the status bar via the runtime's `kiroController` service.
 *
 * Note: the live Agent has its initial model baked into the loop setup; a
 * mid-flight change is reflected in the status bar but the in-flight turn
 * keeps using the original model. The new model applies on the next turn.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { PickerItem } from '../runtime/types'

/** Structural view of `llm-pi-ai` config from `~/.dsh/settings.yaml`. */
interface PiAiConfig {
  providers?: Record<string, {
    displayName?: string
    apiKeyEnv?: string
    models?: ReadonlyArray<{ id: string; name?: string; contextWindow?: number }>
  }>
}

interface KiroController {
  patchAgent(snapshot: {
    activeProvider?: string
    activeModel?: string
    contextLimitTokens?: number
  }): void
  pushSystem(text: string): void
  openPicker(request: {
    title: string
    items: readonly PickerItem[]
    onSelect: (item: PickerItem) => void
  }): void
}

/** Live agent switch handle: mutates the runtime's per-step model ref. */
interface KiroModelSwitch {
  apply(next: { provider: string; model: string }): void
}

function serviceOf<T>(ctx: unknown, name: string): T | undefined {
  if (ctx === null || typeof ctx !== 'object') return undefined
  const c = (ctx as { get?: (name: string) => unknown }).get
  if (typeof c !== 'function') return undefined
  return c.call(ctx, name) as T | undefined
}

function kiroControllerOf(ctx: unknown): KiroController | undefined {
  return serviceOf<KiroController>(ctx, 'kiroController')
}

function kiroModelSwitchOf(ctx: unknown): KiroModelSwitch | undefined {
  return serviceOf<KiroModelSwitch>(ctx, 'kiroModelSwitch')
}

/**
 * Hint at switch time when the target provider's env key is absent — some
 * adapters resolve credentials elsewhere (gateway/fallback), so this is a
 * conditional hint, not a failure prediction.
 */
function missingKeyWarning(piAi: PiAiConfig | undefined, provider: string): string {
  const env = piAi?.providers?.[provider]?.apiKeyEnv
  if (env === undefined || env === '') return ''
  const value = process.env[env]
  if (value === undefined || value === '') {
    return `\n⚠ 环境变量 ${env} 未设置——若调用报错请先 export ${env}`
  }
  return ''
}

function parseModel(input: string): { provider: string; model: string } | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined
  const slashIdx = trimmed.indexOf('/')
  if (slashIdx <= 0 || slashIdx >= trimmed.length - 1) return undefined
  const provider = trimmed.slice(0, slashIdx).trim()
  const model = trimmed.slice(slashIdx + 1).trim()
  if (provider === '' || model === '') return undefined
  return { provider, model }
}

/** Build picker rows from the DSH config's `llm-pi-ai.providers` catalog. */
function buildModelItems(
  piAi: PiAiConfig | undefined,
  current: { provider: string; model: string } | undefined,
): PickerItem[] {
  const items: PickerItem[] = []
  const seen = new Set<string>()
  for (const [route, profile] of Object.entries(piAi?.providers ?? {})) {
    const display = profile.displayName ?? route
    for (const model of profile.models ?? []) {
      const value = `${route}/${model.id}`
      if (seen.has(value)) continue
      seen.add(value)
      items.push({
        value,
        label: `${display} · ${model.name ?? model.id}`,
        hint: `${route}/${model.id}`,
        current: current !== undefined && route === current.provider && model.id === current.model,
      })
    }
  }
  return items
}

/** Resolve a model's catalog context window, when the config declares one. */
function contextWindowOf(
  piAi: PiAiConfig | undefined,
  provider: string,
  model: string,
): number | undefined {
  return piAi?.providers?.[provider]?.models?.find((m) => m.id === model)?.contextWindow
}

export const modelCommand: CommandDefinition = {
  name: 'model',
  description: 'Select the model the current session uses',
  input: { hint: '<provider/model> | (interactive list)' },
  handler: async ({ agent, rawInput }) => {
    const parsed = parseModel(rawInput)
    const ctx = (agent as unknown as { ctx?: unknown }).ctx
    const settings = serviceOf<{ get?: (ns: string) => unknown }>(ctx, 'settings')
    const piAi = settings?.get !== undefined
      ? settings.get('llm-pi-ai') as PiAiConfig | undefined
      : undefined

    // Interactive kiro-style picker when no argument is given.
    if (parsed === undefined) {
      const defaultModel = serviceOf<{
        currentSelection?: () => { provider: string; model: string }
        saveSelection?: (s: { provider: string; model: string }) => Promise<void>
      }>(ctx, 'agentDefaultModel')
      const controller = kiroControllerOf(ctx)
      if (
        defaultModel?.currentSelection === undefined
        || defaultModel.saveSelection === undefined
        || settings?.get === undefined
        || controller === undefined
      ) {
        return {
          kind: 'error',
          text: 'model picker: settings / agentDefaultModel / kiroController are not available',
        }
      }
      const items = buildModelItems(piAi, defaultModel.currentSelection())
      if (items.length === 0) {
        return {
          kind: 'error',
          text: 'no models configured — add providers to llm-pi-ai in ~/.dsh/settings.yaml',
        }
      }
      controller.openPicker({
        title: '选择模型',
        items,
        onSelect: (item) => {
          const next = parseModel(item.value)
          if (next === undefined) return
          const modelSwitch = kiroModelSwitchOf(ctx)
          void (async () => {
            try {
              await defaultModel.saveSelection!(next)
              // Live switch: the next step's request uses the new model.
              modelSwitch?.apply(next)
              const contextLimitTokens = contextWindowOf(piAi, next.provider, next.model)
              controller.patchAgent({
                activeProvider: next.provider,
                activeModel: next.model,
                ...(contextLimitTokens !== undefined ? { contextLimitTokens } : {}),
              })
              controller.pushSystem(
                `模型已切换到 ${next.provider}/${next.model}（下一轮生效）${missingKeyWarning(piAi, next.provider)}`,
              )
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error)
              controller.pushSystem(`model switch failed: ${message}`)
            }
          })()
        },
      })
      return { kind: 'success' }
    }

    // Direct path: /model <provider>/<model>
    const defaultModel = serviceOf<{
      saveSelection?: (s: { provider: string; model: string }) => Promise<void>
    }>(ctx, 'agentDefaultModel')
    if (defaultModel?.saveSelection === undefined) {
      return {
        kind: 'error',
        text: 'agentDefaultModel service is not available; cannot persist the selection',
      }
    }
    try {
      await defaultModel.saveSelection(parsed)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { kind: 'error', text: `failed to persist selection: ${message}` }
    }
    const ctrl = kiroControllerOf(ctx)
    kiroModelSwitchOf(ctx)?.apply(parsed)
    const contextLimitTokens = contextWindowOf(piAi, parsed.provider, parsed.model)
    ctrl?.patchAgent({
      activeProvider: parsed.provider,
      activeModel: parsed.model,
      ...(contextLimitTokens !== undefined ? { contextLimitTokens } : {}),
    })
    return {
      kind: 'success',
      text:
        `model preference set to ${parsed.provider}/${parsed.model}\n`
        + '(status bar updated; the in-flight turn keeps its original model — '
        + 'the new model applies on the next turn.)',
    }
  },
}

export { parseModel, buildModelItems }
