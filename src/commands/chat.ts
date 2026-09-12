/**
 * `/chat` — manage saved sessions: list, resume, delete.
 *
 * Reads headers directly from `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`
 * via {@link import('../utils/sessions').listSessions}, which keeps the
 * dependency surface narrow (no `dsh-session-query-sqlite` plumbing). By
 * default the listing only shows sessions whose working directory matches
 * (or is a parent of) the current `cwd` — most users only want their own
 * recent sessions.
 *
 * `--resume`, `--resume-id`, and `--resume-picker` continue to be handled
 * by `startup.ts` before the runtime mounts, so this command focuses on
 * in-chat operations.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import {
  deleteSession,
  filterSessions,
  formatTimestamp,
  listSessions,
} from '../utils/sessions'

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'list', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'list', args: tokens.slice(1) }
}

/** Render the listing table. */
function listText(rows: ReadonlyArray<{
  id: string; cwd: string; createdAt: number
}>, opts: { all: boolean }): string {
  if (rows.length === 0) {
    return opts.all
      ? '(no sessions under $DSH_HOME/sessions)'
      : '(no sessions for the current working directory — pass `--all` to see every session on disk)'
  }
  const header = `${rows.length.toString().padStart(4)} session(s):`
  const lines: string[] = [header]
  for (const row of rows.slice(0, 50)) {
    const date = formatTimestamp(row.createdAt)
    const cwd = row.cwd === '' ? '(no cwd)' : row.cwd
    lines.push(`  ${row.id.padEnd(40)}  ${date}  ${cwd}`)
  }
  if (rows.length > 50) lines.push(`  … and ${rows.length - 50} more`)
  return lines.join('\n')
}

export const chatCommand: CommandDefinition = {
  name: 'chat',
  description: 'Manage sessions: list, delete, resume',
  input: { hint: '<list|delete|resume> [args]' },
  handler: async ({ rawInput }) => {
    const { name: sub, args } = parseSubcommand(rawInput)
    switch (sub) {
      case 'new':
        return {
          kind: 'success',
          text: 'A fresh session starts the next time `dsh --profile kiro` boots — exit (Ctrl+D) to begin one.',
        }
      case 'list':
      case '': {
        const all = args.includes('--all')
        const summaries = listSessions()
        const filtered = all ? summaries : filterSessions(summaries)
        return { kind: 'success', text: listText(filtered, { all }) }
      }
      case 'resume': {
        const id = args[0]
        if (id === undefined) return { kind: 'success', text: 'usage: /chat resume <session-id>' }
        return {
          kind: 'success',
          text: `Resume ${id} — exit the TUI (Ctrl+D) and re-run: dsh --profile kiro --resume-id ${id}`,
        }
      }
      case 'delete': {
        const target = args[0]
        if (target === undefined) return { kind: 'success', text: 'usage: /chat delete <session-id>' }
        const removed = deleteSession(target)
        return removed
          ? { kind: 'success', text: `deleted session ${target}` }
          : { kind: 'error', text: `no session found for "${target}"` }
      }
      case 'help':
        return { kind: 'success', text: '/chat <list|delete|resume|new> [args]\n  list [--all]  list sessions for this cwd (or every session with --all)' }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /chat help.` }
    }
  },
}

export { listText }