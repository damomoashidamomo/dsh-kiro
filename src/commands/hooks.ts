import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const hooksCommand: CommandDefinition = {
  name: 'hooks',
  description: 'Show the status of context hooks',
  handler: async () => {
    return {
      kind: 'success',
      text: [
        'hook providers:',
        '  @deepseek-ai/dsh-hooks-claude-code  registered',
        '  @deepseek-ai/dsh-hooks-codex         registered',
      ].join('\n'),
    }
  },
}
