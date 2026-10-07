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
import { contextWindowOf } from '../runtime/model-catalog'
import type { PiAiConfig } from '../runtime/model-catalog'

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
 * Hint when the target provider's key is missing. The key is NOT stored in
 * settings.yaml — `apiKeyEnv` there names a credential reference that the
 * adapter resolves across the process environment, the provider-managed
 * store (~/.dsh/.credentials.yaml) and .env files. Check the same way the
 * adapter does: the dsh `credentials` service (describe → configured), with
 * a process.env fallback for bare/test contexts.
 */
async function missingKeyHint(ctx: unknown, piAi: PiAiConfig | undefined, provider: string): Promise<string> {
  const env = piAi?.providers?.[provider]?.apiKeyEnv
  if (env === undefined || env === '') return ''
  const credentials = serviceOf<{
    describe?: (ref: string) => Promise<{ configured: boolean }>
  }>(ctx, 'credentials')
  let configured: boolean
  if (credentials?.describe !== undefined) {
    try {
      configured = (await credentials.describe(env)).configured
    } catch {
      configured = false
    }
  } else {
    const value = process.env[env]
    configured = value !== undefined && value !== ''
  }
  if (configured) return ''
  return `\n⚠ 凭据 ${env} 未配置——若调用报错请先在 dsh 设置里填入 API Key，或 export ${env}`
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
                `模型已切换到 ${next.provider}/${next.model}（下一轮生效）${await missingKeyHint(ctx, piAi, next.provider)}`,
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
    const hint = await missingKeyHint(ctx, piAi, parsed.provider)
    ctrl?.pushSystem(
      `模型已切换到 ${parsed.provider}/${parsed.model}（下一轮生效）${hint}`,
    )
    return { kind: 'success' }
  },
}

export { parseModel, buildModelItems }
