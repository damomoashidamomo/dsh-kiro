import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

const MODES = ['vibe', 'spec'] as const
type Mode = typeof MODES[number]

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value)
}

export const modeCommand: CommandDefinition = {
  name: 'mode',
  description: 'Switch Kiro agent mode: vibe | spec',
  input: { hint: '<vibe|spec>' },
  handler: async ({ rawInput }) => {
    const candidate = rawInput.trim().toLowerCase()
    if (candidate === '' || !isMode(candidate)) {
      return { kind: 'success', text: `usage: /mode <${MODES.join('|')}>` }
    }
    return { kind: 'success', text: `agent mode set to ${candidate}.` }
  },
}
