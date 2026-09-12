/**
 * PickerOverlay — kiro-style interactive list chooser. A slash command opens
 * it with a title + items (see SessionController.openPicker); the user moves
 * with ↑/↓, confirms with Enter, cancels with Esc (or Ctrl+C), and typing
 * filters the list (kiro panels are all fuzzy-searchable). While open it
 * replaces the Prompt row, so its `useInput` is the only input handler
 * besides App's global shortcuts.
 *
 * Filtering is local to this component; selection state stays authoritative
 * in the SessionController (absolute indexes into the full items array).
 *
 * @module @damomoashidamomo/dsh-kiro/ui/PickerOverlay
 */

import { Box, Text, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import { palette } from '../theme/palette'
import type { PickerState } from '../runtime/types'

export interface PickerOverlayProps {
  /** Live picker state (title, items, highlighted index). */
  readonly picker: PickerState
  /** Jump the highlight to an absolute index into `picker.items`. */
  readonly onMoveTo: (index: number) => void
  /** Confirm the highlighted row. */
  readonly onSelect: () => void
  /** Cancel the picker (Esc / Ctrl+C). */
  readonly onClose: () => void
}

/** Render the interactive picker. */
export function PickerOverlay({ picker, onMoveTo, onSelect, onClose }: PickerOverlayProps): JSX.Element {
  const [query, setQuery] = useState<string>('')
  const q = query.trim().toLowerCase()

  // Absolute indexes of rows matching the query (empty query = all rows).
  const filtered = useMemo(() => {
    const indexes: number[] = []
    picker.items.forEach((item, index) => {
      if (
        q === ''
        || item.label.toLowerCase().includes(q)
        || (item.hint ?? '').toLowerCase().includes(q)
        || item.value.toLowerCase().includes(q)
      ) {
        indexes.push(index)
      }
    })
    return indexes
  }, [picker.items, q])

  // Keep the highlight on a visible row when the filter changes.
  useEffect(() => {
    if (filtered.length === 0) return
    if (!filtered.includes(picker.selected)) {
      onMoveTo(filtered[0])
    }
  }, [filtered, picker.selected, onMoveTo])

  useInput((input, key) => {
    if (key.escape) {
      if (query !== '') {
        setQuery('')
      } else {
        onClose()
      }
      return
    }
    if (key.ctrl && input === 'c') {
      onClose()
      return
    }
    if (key.return) {
      if (filtered.length > 0) onSelect()
      return
    }
    if (key.downArrow) {
      const cursor = Math.max(0, filtered.indexOf(picker.selected))
      const next = filtered[cursor + 1]
      if (next !== undefined) onMoveTo(next)
      return
    }
    if (key.upArrow) {
      const cursor = Math.max(0, filtered.indexOf(picker.selected))
      const next = filtered[cursor - 1]
      if (next !== undefined) onMoveTo(next)
      return
    }
    if (key.backspace || key.delete || input === '\b' || input === '\x7f') {
      if (query !== '') setQuery(query.slice(0, -1))
      return
    }
    // Multi-byte chunk (PTY batching, fast key-repeat): Ink parses only the
    // first keypress, so process \r/\n (confirm), backspace/delete bytes,
    // and text bytes one at a time (mirrors Prompt's chunk handling).
    if (input.length > 1 && /[\b\x7f\r\n]/.test(input)) {
      for (const ch of input) {
        if (ch === '\r' || ch === '\n') {
          if (filtered.length > 0) onSelect()
        } else if (ch === '\b' || ch === '\x7f') {
          setQuery((q) => q.slice(0, -1))
        } else {
          setQuery((q) => q + ch)
        }
      }
      return
    }
    if (input !== '' && !key.ctrl && !key.meta) {
      setQuery(query + input)
    }
  }, { isActive: true })

  const maxHint = picker.items.reduce((max, item) => Math.max(max, item.hint?.length ?? 0), 0)
  const rows = filtered.map((index) => {
    const item = picker.items[index]
    const selected = index === picker.selected
    const marker = selected ? palette.accent('› ') : '  '
    const label = item.current ? `${item.label} ${palette.success('✓')}` : item.label
    const hint = item.hint ?? ''
    // Two spaces separate the label from the hint; trailing pad aligns hints.
    const hintText = `${'  '}${hint}${' '.repeat(Math.max(0, maxHint - hint.length))}`
    const body = selected ? palette.accent(`${marker}${label}`) : palette.muted(`${marker}${label}`)
    const styledHint = selected ? palette.accent(hintText) : palette.dim(hintText)
    return (
      <Text key={item.value}>
        {body}
        <Text>{styledHint}</Text>
      </Text>
    )
  })

  const emptyHint = filtered.length === 0
    ? (
        <Box paddingX={1}>
          <Text dimColor>no matches for “{query}”</Text>
        </Box>
      )
    : null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={palette.enabled ? 'green' : undefined} marginTop={1}>
      <Box paddingX={1}>
        <Text>
          <Text color={palette.enabled ? 'green' : undefined}>{palette.accent(picker.title)}</Text>
          <Text dimColor>{query !== '' ? `  · filter: ${query}` : '  · ↑/↓ 选择 · 输入过滤 · Enter 确认 · Esc 取消'}</Text>
        </Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {rows}
        {emptyHint}
      </Box>
    </Box>
  )
}
