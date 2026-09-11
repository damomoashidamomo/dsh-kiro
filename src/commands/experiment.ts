import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

const FEATURES = ['knowledge', 'thinking', 'tangent', 'todos', 'checkpoint', 'delegate'] as const
type Feature = typeof FEATURES[number]

function isFeature(value: string): value is Feature {
  return (FEATURES as readonly string[]).includes(value)
}

export const experimentCommand: CommandDefinition = {
  name: 'experiment',
  description: 'Toggle experimental features: knowledge, thinking, tangent, todos, checkpoint, delegate',
  input: { hint: '<feature> [on|off]' },
  handler: async ({ rawInput }) => {
    const trimmed = rawInput.trim()
    const tokens = trimmed.split(/\s+/u)
    const feature = tokens[0] ?? ''
    const toggle = (tokens[1] ?? '').toLowerCase()
    if (!isFeature(feature)) {
      return { kind: 'success', text: `usage: /experiment <${FEATURES.join('|')}> [on|off]` }
    }
    if (toggle !== 'on' && toggle !== 'off') {
      return { kind: 'success', text: 'usage: /experiment <feature> <on|off>' }
    }
    return { kind: 'success', text: `${feature} ${toggle === 'on' ? 'enabled' : 'disabled'} (stored in settings).` }
  },
}
