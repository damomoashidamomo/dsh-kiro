/**
 * `/quit` — exit the TUI. Equivalent to Ctrl+D.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const quitCommand: CommandDefinition = {
  name: 'quit',
  description: 'Exit the TUI (equivalent to Ctrl+D)',
  handler: async () => {
    process.stdout.write('\x1b[?1049l')
    process.exit(0)
  },
}
