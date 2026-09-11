import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const replyCommand: CommandDefinition = {
  name: 'reply',
  description: 'Quote the last assistant message into the editor for follow-up',
  handler: async () => {
    return { kind: 'success', text: '/reply: quote the last assistant message into the next prompt (phase 3 wires the editor surface).' }
  },
}
