import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'list', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'list', args: tokens.slice(1) }
}

export const checkpointCommand: CommandDefinition = {
  name: 'checkpoint',
  description: 'Workspace snapshots — init, list, expand, diff, restore, clean',
  input: { hint: '<init|list|expand|diff|restore|clean>' },
  handler: async ({ rawInput }) => {
    const { name: sub } = parseSubcommand(rawInput)
    switch (sub) {
      case 'init':
        return { kind: 'success', text: 'checkpoint init lands in phase 5 (creates .kiro/checkpoints/ as a git shadow repo).' }
      case 'list':
      case '':
        return { kind: 'success', text: '(no checkpoints — phase 5)' }
      case 'expand':
      case 'diff':
      case 'restore':
      case 'clean':
        return { kind: 'success', text: `/checkpoint ${sub} lands in phase 5.` }
      case 'help':
        return { kind: 'success', text: '/checkpoint <init|list|expand|diff|restore|clean> [args]' }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /checkpoint help.` }
    }
  },
}
