/**
 * Edit-tool diff builder for approval cards — the B1 kiro-parity piece:
 * when the model wants to change a file, the approval panel shows the
 * actual diff (red deletions, green additions) instead of a JSON blob.
 *
 * Sources: the pending tool call's full argument JSON (the controller
 * records it on tool/call) plus the CURRENT file on disk (the TUI runs
 * locally, so reading the pre-edit content is safe) — a small LCS line
 * diff produces unified-style hunks.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/diff
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

/** One rendered diff row. */
export interface DiffRow {
  readonly kind: 'hunk' | 'ctx' | 'add' | 'del' | 'note'
  readonly text: string
}

/** Tools whose calls carry editable payloads we can diff. */
const EDIT_TOOLS = new Set(['edit', 'str_replace_editor', 'write'])

/** Whether an approval for this tool name can show a diff. */
export function isEditableTool(toolName: string): boolean {
  return EDIT_TOOLS.has(toolName)
}

interface EditArgs {
  command?: string
  path?: string
  file_path?: string
  old_str?: string
  new_str?: string
  old_string?: string
  new_string?: string
  replace_all?: boolean
  content?: string
}

/** Cap the rendered diff so a huge file cannot flood the panel. */
const MAX_ROWS = 60
const CONTEXT = 3

/** Build the diff rows for a pending edit-tool call. */
export function buildEditDiff(toolName: string, argsJson: string | undefined): DiffRow[] | undefined {
  if (argsJson === undefined || argsJson === '' || !isEditableTool(toolName)) return undefined
  let args: EditArgs
  try {
    args = JSON.parse(argsJson) as EditArgs
  } catch {
    return undefined
  }
  const rawPath = args.path ?? args.file_path
  if (typeof rawPath !== 'string' || rawPath === '') return undefined
  const absPath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath)

  let before: string
  try {
    before = readFileSync(absPath, 'utf8')
  } catch {
    before = undefined as unknown as string // new file
  }

  let after: string | undefined
  if (toolName === 'edit') {
    // dsh-tool-fs `edit`: literal old_string -> new_string.
    if (before === undefined) return [{ kind: 'note', text: '原文件不可读' }]
    const oldStr = args.old_string
    if (typeof oldStr !== 'string' || oldStr === '') return undefined
    if (!before.includes(oldStr)) {
      return [{ kind: 'note', text: 'old_string 在当前文件中未找到（文件可能已被修改）' }]
    }
    const replacement = typeof args.new_string === 'string' ? args.new_string : ''
    after = args.replace_all === true ? before.split(oldStr).join(replacement) : before.replace(oldStr, replacement)
  } else if (toolName === 'write') {
    after = typeof args.content === 'string' ? args.content : undefined
  } else {
    const command = args.command
    if (command === 'create') {
      after = typeof args.content === 'string' ? args.content : undefined
    } else if (command === 'str_replace' && typeof args.old_str === 'string') {
      const replacement = typeof args.new_str === 'string' ? args.new_str : ''
      if (before === undefined) return [{ kind: 'note', text: `新内容（原文件不可读）：\n${truncateText(replacement)}` }]
      if (!before.includes(args.old_str)) {
        return [{ kind: 'note', text: 'old_str 在当前文件中未找到（文件可能已被修改）' }]
      }
      after = before.replace(args.old_str, replacement)
    } else if (command === 'insert' && typeof args.new_str === 'string') {
      after = `${before ?? ''}${args.new_str}`
    } else {
      return undefined
    }
  }
  if (after === undefined) return undefined

  const header: DiffRow[] = [
    { kind: 'hunk', text: `--- ${before === undefined ? '(新文件)' : rawPath}` },
    { kind: 'hunk', text: `+++ ${rawPath}` },
  ]
  const rows = before === undefined
    ? after.split('\n').map((line): DiffRow => ({ kind: 'add', text: line }))
    : unifiedRows(before.split('\n'), after.split('\n'))
  const limited = rows.length > MAX_ROWS
    ? [...rows.slice(0, MAX_ROWS), { kind: 'note' as const, text: `… 还有 ${rows.length - MAX_ROWS} 行未显示` }]
    : rows
  return [...header, ...limited]
}

/** LCS line diff → unified-style rows with hunk headers and context. */
function unifiedRows(a: readonly string[], b: readonly string[]): DiffRow[] {
  // LCS table (bounded: fall back to full-replace when huge).
  if (a.length * b.length > 4_000_000) {
    return [
      ...a.map((line): DiffRow => ({ kind: 'del', text: line })),
      ...b.map((line): DiffRow => ({ kind: 'add', text: line })),
    ]
  }
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  type Op = { kind: 'ctx' | 'del' | 'add'; text: string; a?: number; b?: number }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'ctx', text: a[i]!, a: i, b: j })
      i += 1; j += 1
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: 'del', text: a[i]!, a: i })
      i += 1
    } else {
      ops.push({ kind: 'add', text: b[j]!, b: j })
      j += 1
    }
  }
  while (i < m) { ops.push({ kind: 'del', text: a[i]!, a: i }); i += 1 }
  while (j < n) { ops.push({ kind: 'add', text: b[j]!, b: j }); j += 1 }

  // Collapse into hunks: only rows within CONTEXT of a change survive.
  const keep = new Array<boolean>(ops.length).fill(false)
  ops.forEach((op, idx) => {
    if (op.kind !== 'ctx') {
      for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(ops.length - 1, idx + CONTEXT); k += 1) {
        keep[k] = true
      }
    }
  })
  const rows: DiffRow[] = []
  let open = false
  let aStart = 0
  let bStart = 0
  ops.forEach((op, idx) => {
    if (!keep[idx]) {
      if (open) { rows.push({ kind: 'hunk', text: '⋯' }); open = false }
      return
    }
    if (!open) {
      aStart = (op.a ?? op.b ?? 0) + 1
      bStart = (op.b ?? op.a ?? 0) + 1
      rows.push({ kind: 'hunk', text: `@@ -${aStart} +${bStart} @@` })
      open = true
    }
    rows.push({ kind: op.kind, text: op.text })
  })
  return rows
}

function truncateText(text: string, max = 800): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}
