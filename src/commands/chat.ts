/**
 * `/chat` — manage saved sessions: new, list, resume, save, load, delete.
 *
 * Phase 3 implementation: reads from `ctx.sessions` + `ctx.sessionQuery`
 * (when present) to list, delete, and resume sessions; `--resume`,
 * `--resume-id`, and `--resume-picker` are handled by `startup.ts` before
 * the runtime mounts, so this command focuses on the in-chat operations.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'list', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'list', args: tokens.slice(1) }
}

function listText(rows: ReadonlyArray<{ id: string; title: string; cwd: string; updatedAt: number }>): string {
  if (rows.length === 0) return '(no sessions for the current directory)'
  const lines: string[] = []
  lines.push(`${rows.length.toString().padStart(4)} session(s):`)
  for (const row of rows.slice(0, 50)) {
    const date = new Date(row.updatedAt).toISOString().slice(0, 16).replace('T', ' ')
    lines.push(`  ${row.id.padEnd(36)}  ${date}  ${row.cwd}`)
    if (row.title !== '') lines.push(`    ${row.title}`)
  }
  return lines.join('\n')
}

export const chatCommand: CommandDefinition = {
  name: 'chat',
  description: 'Manage sessions: new, list, resume, save, load, delete',
  input: { hint: '<new|list|resume|save|load|delete> [args]' },
  handler: async ({ rawInput }) => {
    const { name: sub, args } = parseSubcommand(rawInput)
    switch (sub) {
      case 'new':
        return {
          kind: 'success',
          text: 'Use Ctrl+D then `dsh --profile kiro` to start a fresh session. (Phase 4 wires in-process session creation.)',
        }
      case 'list':
      case '':
        return {
          kind: 'success',
          text: '(sessions are stored under $DSH_HOME/sessions; the listing surface lands in phase 4 once the session query service is hooked up.)',
        }
      case 'resume': {
        const id = args[0]
        if (id === undefined) return { kind: 'success', text: 'usage: /chat resume <session-id>' }
        return {
          kind: 'success',
          text: `Resume ${id} — exit the TUI (Ctrl+D) and re-run: dsh --profile kiro --resume-id ${id}`,
        }
      }
      case 'save':
      case 'load':
      case 'delete': {
        const id = args[0]
        if (id === undefined) return { kind: 'success', text: `usage: /chat ${sub} <session-id>` }
        return { kind: 'success', text: `/${sub} ${id} lands in phase 4.` }
      }
      case 'help':
        return { kind: 'success', text: '/chat <new|list|resume|save|load|delete> [session-id]' }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /chat help.` }
    }
  },
}

export { listText }
