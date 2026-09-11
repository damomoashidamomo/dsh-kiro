import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

/**
 * `/tangent` — toggle tangent mode (isolated side conversations that can be
 * merged back into the main context). Phase 3 ships the surface; phase 5
 * implements the lifecycle (start / tail / forget).
 */

export const tangentCommand: CommandDefinition = {
  name: 'tangent',
  description: 'Toggle tangent mode — isolated side conversations that do not pollute the main context',
  handler: async () => {
    return {
      kind: 'success',
      text: 'tangent toggle lands in phase 5 (Ctrl+T will be the hotkey once the kiro-tangent plugin mounts).',
    }
  },
}
