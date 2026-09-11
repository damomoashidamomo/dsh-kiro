import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'status', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'status', args: tokens.slice(1) }
}

export const codeCommand: CommandDefinition = {
  name: 'code',
  description: 'Code intelligence (LSP): init, status, logs, overview, summary',
  input: { hint: '<init|status|logs|overview|summary>' },
  handler: async ({ rawInput }) => {
    const { name: sub } = parseSubcommand(rawInput)
    switch (sub) {
      case 'init':
        return { kind: 'success', text: 'LSP init lands in phase 5 (spawns typescript-language-server, pyright, rust-analyzer, gopls, …).' }
      case 'status':
      case '':
        return { kind: 'success', text: 'LSP pool status — phase 5.' }
      case 'logs':
      case 'overview':
      case 'summary':
        return { kind: 'success', text: `/code ${sub} lands in phase 5.` }
      case 'help':
        return { kind: 'success', text: '/code <init|status|logs|overview|summary>' }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /code help.` }
    }
  },
}
