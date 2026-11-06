/**
 * Row building for the option pickers — pure helpers so the ordering and the
 * height budget can be unit-tested without rendering Ink.
 *
 * @module @damomoashidomomo/dsh-kiro/ui/pickerRows
 */

import type { OptionItem } from './OptionMenu'
import type { SubcommandRow } from '../commands/subcommands'

/** One saved session as the picker sees it. */
export interface PickerSession {
  readonly id: string
  readonly title: string
  /** Timestamp shown until (or instead of) the title. */
  readonly when: string
}

/** Abbreviate a session id to the part that tells sessions apart. */
function shortId(id: string): string {
  const stripped = id.replace(/^session-/u, '')
  return stripped.slice(0, 13)
}

/**
 * Build the `/chat` picker rows.
 *
 * Order: the static subcommands with the concrete sessions right after
 * `resume <id>` (they ARE the resume targets), and `help` last. The `list`
 * row carries the total so a truncated menu still tells the user how to see
 * everything.
 *
 * `maxSessions` is the terminal-height budget: the menu is windowed by
 * OptionMenu, but trimming here keeps the row count predictable.
 */
export function chatPickerRows(
  subcommands: readonly SubcommandRow[],
  sessions: readonly PickerSession[],
  total: number,
  maxSessions: number,
): readonly OptionItem[] {
  const showable = sessions.slice(0, Math.max(0, maxSessions))
  const rows: OptionItem[] = subcommands.map((row) => ({
    value: row.value,
    label: row.value,
    hint: row.value === 'list' && total > showable.length
      ? `列出全部 ${total} 个会话（表格）`
      : row.hint,
  }))
  const anchor = rows.findIndex((row) => row.value.startsWith('resume'))
  const insertAt = anchor === -1 ? rows.length : anchor + 1
  const sessionRows: OptionItem[] = showable.map((session) => ({
    value: `resume ${session.id}`,
    label: shortId(session.id),
    hint: session.title !== '' ? session.title : session.when,
  }))
  rows.splice(insertAt, 0, ...sessionRows)
  return rows
}

/**
 * How many session rows fit: leave room for the border, the title, the footer
 * and the static subcommands, and never offer fewer than four (a menu that
 * cannot list four sessions is useless — scrolling covers the rest).
 */
export function sessionRowBudget(terminalRows: number | undefined, staticRows: number): number {
  const rows = terminalRows ?? 30
  const chrome = 4 // border top/bottom, title, footer
  const room = rows - chrome - staticRows
  return Math.max(4, Math.min(20, room))
}
