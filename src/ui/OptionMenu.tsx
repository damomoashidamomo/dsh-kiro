/**
 * OptionMenu — the interactive picker for commands with enumerated arguments
 * (/engine, /loop, /tools, /spec, /skills). Same visual language as the
 * approval panel: numbered options with descriptions, ↑/↓ or number keys to
 * choose, Enter to apply, Esc to cancel. This is what the menu review asked
 * for: select the COMMAND first, then pick the OPTION from a clear menu
 * instead of reading usage text.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/OptionMenu
 */

import { Box, Text, useInput, useStdout } from 'ink'
import { displayWidth } from '../markdown/render'
import { useEffect, useState } from 'react'
import { palette } from '../theme/palette'

export interface OptionItem {
  /** The argument to submit when chosen (e.g. 'kiro', 'rust', 'start'). */
  readonly value: string
  /** Bold option label shown at the left. */
  readonly label: string
  /** One-line explanation. */
  readonly hint: string
}

export interface OptionMenuProps {
  /** Menu title, usually includes the current value. */
  readonly title: string
  readonly options: readonly OptionItem[]
  readonly onPick: (value: string) => void
  readonly onCancel: () => void
}

function clipColumns(text: string, width: number): string {
  if (width <= 1) return text.length > 0 ? '…' : ''
  let used = 0
  let out = ''
  for (const ch of text) {
    const w = displayWidth(ch)
    if (used + w > width - 1) return `${out}…`
    used += w
    out += ch
  }
  return out
}

export function OptionMenu({ title, options, onPick, onCancel }: OptionMenuProps): JSX.Element {
  const [cursor, setCursor] = useState(0)
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 100
  const terminalRows = stdout?.rows ?? 30

  useEffect(() => {
    setCursor(0)
  }, [title])

  // Window the rows so a long menu (/chat with 20 sessions) never pushes the
  // border, title or footer off a short terminal. The window follows the
  // cursor, and the numbering stays ABSOLUTE so number keys keep working.
  const budget = Math.max(4, terminalRows - 6) // border 2, title 1, footer 1, prompt 2
  const windowed = options.length > budget
  const start = windowed
    ? Math.min(Math.max(0, cursor - budget + 2), Math.max(0, options.length - budget))
    : 0
  const visible = windowed ? options.slice(start, start + budget) : options
  const hiddenAbove = start
  const hiddenBelow = Math.max(0, options.length - (start + visible.length))

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(options.length - 1, c + 1))
      return
    }
    if (key.return) {
      const pick = options[cursor]
      if (pick !== undefined) onPick(pick.value)
      return
    }
    if (key.backspace || key.delete) {
      onCancel()
      return
    }
    if (!key.ctrl && !key.meta && /^[1-9]$/u.test(input)) {
      const idx = Number(input) - 1
      const pick = options[idx]
      if (pick !== undefined) onPick(pick.value)
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={palette.enabled ? 'green' : undefined} paddingX={1} marginTop={1}>
      <Box paddingX={1}>
        <Text>{palette.accent(title)}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {hiddenAbove > 0 ? (
          <Text dimColor>{`  ↑ 还有 ${hiddenAbove} 项`}</Text>
        ) : null}
        {visible.map((opt, offset) => {
          const idx = start + offset
          const selected = idx === cursor
          const marker = selected ? palette.accent('▸ ') : '  '
          const num = palette.muted(`${idx + 1} `)
          const label = selected ? palette.accent(opt.label) : palette.bold(opt.label)
          const hintBudget = Math.max(8, columns - displayWidth(opt.label) - 14)
          const hint = clipColumns(opt.hint, hintBudget)
          const hintStyled = selected ? hint : palette.dim(hint)
          return (
            <Text key={opt.value}>
              <Text>{marker}</Text>
              <Text>{num}</Text>
              <Text>{label} — </Text>
              <Text>{hintStyled}</Text>
            </Text>
          )
        })}
        {hiddenBelow > 0 ? (
          <Text dimColor>{`  ↓ 还有 ${hiddenBelow} 项`}</Text>
        ) : null}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>↑/↓ 或数字键选择 · Enter 生效 · Esc 取消</Text>
      </Box>
    </Box>
  )
}

/**
 * Patch session titles into a picker's rows: `resume <id>` rows get the loaded
 * title, every other row is left alone. Titles load after the menu is drawn
 * (they read each session log), so this runs as a second pass.
 */
export function withSessionTitles(
  options: readonly OptionItem[],
  titles: ReadonlyMap<string, string>,
): readonly OptionItem[] {
  return options.map((option) => {
    const id = /^resume (\S+)$/u.exec(option.value)?.[1]
    const title = id !== undefined ? titles.get(id) : undefined
    return title === undefined || title === '' ? option : { ...option, hint: title }
  })
}
