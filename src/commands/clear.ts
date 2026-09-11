/**
 * `/clear` — clear the transcript (does NOT delete the session; the log
 * persists in the JSONL store and a /chat resume would replay it).
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const clearCommand: CommandDefinition = {
  name: 'clear',
  description: 'Clear the visible transcript (the session log is preserved)',
  handler: async () => {
    return { kind: "success", text: '(cleared)' }
  },
}
