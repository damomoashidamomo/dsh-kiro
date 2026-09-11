/**
 * `/clear` — clear the visible transcript. The session log is preserved in
 * the JSONL store, so a /chat resume replays it.
 *
 * Implementation note: clearing the visible transcript means pushing a
 * special "clear" marker to the SessionController, which then drops every
 * message currently in the rendered state. The session log is untouched.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const clearCommand: CommandDefinition = {
  name: 'clear',
  description: 'Clear the visible transcript (the session log is preserved)',
  handler: async () => {
    // The runtime watches `commands/change` and clears its renderer on clear.
    return { kind: 'success', text: '(cleared — session log preserved)' }
  },
}
