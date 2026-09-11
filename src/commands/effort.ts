import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = typeof EFFORTS[number]

function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value)
}

export const effortCommand: CommandDefinition = {
  name: 'effort',
  description: 'Set reasoning-effort: low | medium | high | xhigh | max',
  input: { hint: '<level>' },
  handler: async ({ rawInput }) => {
    const candidate = rawInput.trim().toLowerCase()
    if (candidate === '' || !isEffort(candidate)) {
      return {
        kind: 'success',
        text: [
          `usage: /effort <${EFFORTS.join('|')}>`,
          `current levels: low, medium, high, xhigh, max`,
        ].join('\n'),
      }
    }
    return { kind: 'success', text: `reasoning effort set to ${candidate}.` }
  },
}
