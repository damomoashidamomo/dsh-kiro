/**
 * `/model <provider>/<model>` — pick the model the current session uses.
 *
 * The selection is persisted through `agentDefaultModel.saveSelection`, which
 * writes to the agent-default-model settings scope so the next launch (and
 * every session bound to that scope) picks it up. The status bar updates
 * immediately via the runtime's `kiroController` service.
 *
 * Note: the live Agent has its initial model baked into the loop setup; a
 * mid-flight change is reflected in the status bar but the in-flight turn
 * keeps using the original model. The new model applies on the next turn.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

interface KiroController {
  patchAgent(snapshot: { activeProvider?: string; activeModel?: string }): void
}

function kiroControllerOf(ctx: unknown): KiroController | undefined {
  if (ctx === null || typeof ctx !== 'object') return undefined
  const c = (ctx as { get?: (name: string) => unknown }).get
  if (typeof c !== 'function') return undefined
  return c.call(ctx, 'kiroController') as KiroController | undefined
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

export const modelCommand: CommandDefinition = {
  name: 'model',
  description: 'Select the model the current session uses',
  input: { hint: '<provider/model>' },
  handler: async ({ agent, rawInput }) => {
    const parsed = parseModel(rawInput)
    if (parsed === undefined) {
      return {
        kind: 'success',
        text: [
          'usage: /model <provider>/<model>',
          '',
          'examples:',
          '  /model deepseek-official/deepseek-v4-flash',
          '  /model anthropic/claude-sonnet-4.6',
        ].join('\n'),
      }
    }
    const ctx = (agent as unknown as { ctx?: unknown }).ctx
    const defaultModel = (ctx as { get?: (n: string) => unknown } | undefined)?.get?.call(ctx, 'agentDefaultModel') as
      | { saveSelection?: (s: { provider: string; model: string }) => Promise<void>; currentSelection?: () => { provider: string; model: string } }
      | undefined
    if (defaultModel === undefined || typeof defaultModel.saveSelection !== 'function') {
      return {
        kind: 'error',
        text: 'agentDefaultModel service is not available; cannot persist the selection',
      }
    }
    try {
      await defaultModel.saveSelection({ provider: parsed.provider, model: parsed.model })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { kind: 'error', text: `failed to persist selection: ${message}` }
    }
    const ctrl = kiroControllerOf(ctx)
    ctrl?.patchAgent({
      activeProvider: parsed.provider,
      activeModel: `${parsed.provider}/${parsed.model}`,
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

export { parseModel }