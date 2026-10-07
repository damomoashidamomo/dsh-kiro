/**
 * kiro-style tool-permission panel. Shown in place of the prompt while the
 * platform's approval waterfall waits on this TUI's answerer:
 *
 *   ⚠ 工具需要批准
 *   工具: bash
 *   原因: escalate sandbox to danger-full-access: …
 *
 *   ❯ 1 允许一次
 *     2 本会话始终允许 (bash)
 *     3 拒绝（可填理由）
 *
 * Keys: 1/2/3 pick directly; ↑/↓ + Enter pick kiro-list style; Esc denies
 * without a reason. Choosing 拒绝 switches to a one-line reason input
 * (Enter submits — empty denies outright, Esc denies outright). Ctrl+C is
 * deliberately NOT consumed here: it falls through to the App's interrupt
 * handler and cancels the whole turn, which aborts the approval request.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/ApprovalOverlay
 */

import React, { useState } from 'react'
import { Text, Box, useInput } from 'ink'
import type { ApprovalChoice, ApprovalRequestUi } from '../runtime/types'
import { palette } from '../theme/palette'
import type { DiffRow } from './diff'

const OPTIONS = [
  { key: '1', label: '允许一次' },
  { key: '2', label: '本会话始终允许' },
  { key: '3', label: '本项目始终允许（写入 .kiro/approvals.json）' },
  { key: '4', label: '拒绝（可填理由）' },
] as const

export function ApprovalOverlay(props: {
  /** Edit-tool diff rows (B1): red/green view of what the call changes. */
  diff?: readonly DiffRow[] | undefined,
  request: ApprovalRequestUi
  onResolve: (choice: ApprovalChoice) => void
}): React.ReactElement {
  const [selected, setSelected] = useState(0)
  const [reasonMode, setReasonMode] = useState(false)
  const [reason, setReason] = useState('')

  useInput((input, key) => {
    // Deny helper: empty/whitespace reason denies outright.
    const denyWith = (text: string): void => {
      const trimmed = text.trim()
      props.onResolve(trimmed === '' ? { kind: 'deny', reason: undefined } : { kind: 'deny', reason: trimmed })
    }

    // React state updates do not apply inside one synchronous loop, so a
    // PTY-batched chunk (`3no\r`) is folded through LOCAL mode/buffer state
    // first; the committed state catches up at the end.
    if (reasonMode) {
      if (input === '') {
        if (key.return) {
          denyWith(reason)
        } else if (key.escape) {
          props.onResolve({ kind: 'deny', reason: undefined })
        } else if (key.delete || key.backspace) {
          setReason((prev) => prev.slice(0, -1))
        }
        return
      }
      let buffer = reason
      let submit = false
      for (const ch of input) {
        if (ch === '\r' || ch === '\n') {
          submit = true
          break
        }
        if (ch === '\x1b') {
          props.onResolve({ kind: 'deny', reason: undefined })
          return
        }
        if (ch === '\b' || ch === '\x7f') buffer = buffer.slice(0, -1)
        else if (ch >= ' ') buffer += ch
      }
      setReason(buffer)
      if (submit) denyWith(buffer)
      return
    }

    const pick = (index: number): void => {
      if (index === 3) {
        setReasonMode(true)
        return
      }
      if (index === 1) props.onResolve({ kind: 'allow-session' })
      else if (index === 2) props.onResolve({ kind: 'allow-project' })
      else props.onResolve({ kind: 'allow-once' })
    }

    if (input === '') {
      if (key.return) pick(selected)
      else if (key.upArrow) setSelected((prev) => Math.max(0, prev - 1))
      else if (key.downArrow) setSelected((prev) => Math.min(OPTIONS.length - 1, prev + 1))
      else if (key.escape) props.onResolve({ kind: 'deny', reason: undefined })
      return
    }

    // Option mode: a chunk may enter reason mode mid-string (`3no\r`), so
    // keep folding bytes through a local mode/buffer pair.
    let enteringReason = false
    let buffer = ''
    for (const ch of input) {
      if (enteringReason) {
        if (ch === '\r' || ch === '\n') {
          denyWith(buffer)
          return
        }
        if (ch === '\b' || ch === '\x7f') buffer = buffer.slice(0, -1)
        else if (ch >= ' ' && ch !== '\x1b') buffer += ch
        continue
      }
      if (ch === '\x1b') {
        props.onResolve({ kind: 'deny', reason: undefined })
        return
      }
      if (ch === '\r' || ch === '\n') {
        pick(selected)
        return
      }
      const direct = OPTIONS.findIndex((option) => option.key === ch)
      if (direct === 3) {
        enteringReason = true
        continue
      }
      if (direct >= 0) {
        pick(direct)
        return
      }
    }
    if (enteringReason) {
      setReason(buffer)
      setReasonMode(true)
    }
  })

  return (
    <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Box>
        <Text>{palette.warning('⚠ 工具需要批准')}</Text>
      </Box>
      <Box>
        <Text dimColor>工具: </Text>
        <Text>{palette.accent(props.request.toolName)}</Text>
      </Box>
      {props.request.reason !== undefined && props.request.reason !== '' && (
        <Box>
          <Text dimColor>原因: </Text>
          <Text wrap="truncate-end">{props.request.reason}</Text>
        </Box>
      )}
      {props.diff !== undefined && props.diff.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {props.diff.map((row, idx) => (
            <Text key={idx} wrap="truncate-end">
              {renderDiffRow(row)}
            </Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {reasonMode ? (
          <>
            <Text dimColor>拒绝理由（回车提交，留空直接拒绝，Esc 直接拒绝）：</Text>
            <Text>{reason === '' ? palette.muted('…') : reason}</Text>
          </>
        ) : (
          OPTIONS.map((option, index) => (
            <Box key={option.key}>
              <Text>{index === selected ? palette.accent('❯ ') : palette.muted('  ')}</Text>
              <Text bold={index === selected}>
                {index === selected
                  ? palette.bold(`${option.key} ${option.label}${option.key === '2' ? ` (${props.request.toolName})` : ''}`)
                  : palette.muted(`${option.key} ${option.label}${option.key === '2' ? ` (${props.request.toolName})` : ''}`)}
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
}


/** Color one diff row for the approval panel. */
function renderDiffRow(row: DiffRow): string {
  switch (row.kind) {
    case 'add':
      return palette.success(`+ ${row.text}`)
    case 'del':
      return palette.error(`- ${row.text}`)
    case 'hunk':
      return palette.accentSoft(row.text)
    case 'note':
      return palette.muted(row.text)
    default:
      return palette.dim(`  ${row.text}`)
  }
}
