import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const pasteCommand: CommandDefinition = {
  name: 'paste',
  description: 'Paste an image from the system clipboard',
  handler: async () => {
    return {
      kind: 'success',
      text: '/paste: image paste from the system clipboard lands in phase 3 (cross-platform via PowerShell / osascript / xclip).',
    }
  },
}
