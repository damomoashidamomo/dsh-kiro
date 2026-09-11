import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const changelogCommand: CommandDefinition = {
  name: 'changelog',
  description: 'Show the latest dsh-kiro changes',
  handler: async () => {
    return {
      kind: 'success',
      text: [
        'dsh-kiro changelog:',
        '  0.1.0  initial release — phase 1 skeleton + phase 2 interaction + phase 3 commands',
        '        https://github.com/damomoashidamomo/dsh-kiro/releases',
      ].join('\n'),
    }
  },
}
