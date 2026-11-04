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

import { Box, Text, useInput } from 'ink'
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

export function OptionMenu({ title, options, onPick, onCancel }: OptionMenuProps): JSX.Element {
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    setCursor(0)
  }, [title])

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
        {options.map((opt, idx) => {
          const selected = idx === cursor
          const marker = selected ? palette.accent('▸ ') : '  '
          const num = palette.muted(`${idx + 1} `)
          const label = selected ? palette.accent(opt.label) : palette.bold(opt.label)
          const hint = selected ? opt.hint : palette.dim(opt.hint)
          return (
            <Text key={opt.value}>
              <Text>{marker}</Text>
              <Text>{num}</Text>
              <Text>{label} — </Text>
              <Text>{hint}</Text>
            </Text>
          )
        })}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>↑/↓ 或数字键选择 · Enter 生效 · Esc 取消</Text>
      </Box>
    </Box>
  )
}
