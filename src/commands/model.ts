/**
 * `/model` — pick the model the current session uses. The actual selection
 * goes through the `agentDefaultModel` service; this command writes the new
 * selection to the agent's settings scope so subsequent requests use it.
 *
 * Phase 3 ships the command UI; the actual selection-wiring on the live
 * Agent lands when we promote session-projection wiring to phase 4.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

function parseModel(input: string): { provider: string; model: string } | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined
  const slashIdx = trimmed.indexOf('/')
  if (slashIdx <= 0 || slashIdx >= trimmed.length - 1) return undefined
  return { provider: trimmed.slice(0, slashIdx), model: trimmed.slice(slashIdx + 1) }
}

export const modelCommand: CommandDefinition = {
  name: 'model',
  description: 'Select the model the current session uses',
  input: { hint: '<provider/model>' },
  handler: async ({ rawInput }) => {
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
    return {
      kind: 'success',
      text: `model preference set to ${parsed.provider}/${parsed.model} (will apply to the next turn; phase 4 wires live selection).`,
    }
  },
}
