/**
 * SlashMenu — Ctrl+K overlay that fuzzy-searches the entire slash-command
 * registry. Renders groups of commands; arrow-key navigation picks one and
 * Enter dispatches it as if the user had typed it.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/SlashMenu
 */

import { Box, Text, useInput } from 'ink'
import { useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { palette } from '../theme/palette'
import { groupCommands } from '../commands/registry'

export interface SlashMenuProps {
  /** Initial query — usually the partial `/foo` the user already typed. */
  readonly initialQuery: string
  /** Whether the menu is open. */
  readonly active: boolean
  /** Close without dispatching. */
  readonly onClose: () => void
  /** Dispatch the chosen command (write the chosen `/name …` to the prompt). */
  readonly onSelect: (text: string) => void
}

/** Render the slash-command palette. */
export function SlashMenu({ initialQuery, active, onClose, onSelect }: SlashMenuProps): JSX.Element | null {
  const groups = useMemo(() => groupCommands(), [])
  const flat = useMemo(() => groups.flatMap((g) => g.items.map((c) => ({ ...c, group: g.title }))), [groups])
  const fuse = useMemo(() => new Fuse(flat, {
    keys: ['name', 'description'],
    threshold: 0.35,
    ignoreLocation: true,
  }), [flat])
  const [query, setQuery] = useState<string>(initialQuery.replace(/^\//, ''))
  const [cursor, setCursor] = useState<number>(0)

  const visible = query === ''
    ? flat.slice(0, 30)
    : fuse.search(query).map((r) => r.item).slice(0, 30)

  useInput((input, key) => {
    if (!active) return
    if (key.escape) {
      onClose()
      return
    }
    if (key.return) {
      const target = visible[cursor] ?? visible[0]
      if (target !== undefined) {
        onSelect(`/${target.name} `)
      }
      onClose()
      return
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(visible.length - 1, c + 1))
      return
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    if (key.backspace) {
      setQuery((q) => q.slice(0, -1))
      setCursor(0)
      return
    }
    if (input.length > 0 && !key.ctrl && !key.meta) {
      setQuery((q) => q + input)
      setCursor(0)
    }
  })

  if (!active) return null
  return (
    <Box flexDirection="column" paddingX={1} marginTop={0} borderStyle="round" borderColor={palette.enabled ? 'green' : undefined}>
      <Box flexDirection="row" paddingX={1}>
        <Text>{palette.accent('/')} </Text>
        <Text>{palette.accent(query === '' ? '_' : `${query}_`)}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {visible.map((cmd, idx) => {
          const isSelected = idx === cursor
          const marker = isSelected ? palette.accent('▸ ') : '  '
          const label = isSelected ? palette.accent(`/${cmd.name}`) : `/${cmd.name}`
          const group = palette.muted(` [${cmd.group}]`)
          const desc = palette.dim(`  ${cmd.description}`)
          return (
            <Text key={cmd.name}>
              <Text>{marker}</Text>
              <Text>{label.padEnd(18)}</Text>
              <Text>{group}</Text>
              <Text>{desc}</Text>
            </Text>
          )
        })}
        {visible.length === 0 ? (
          <Text dimColor>{palette.muted(`no commands match "${query}"`)}</Text>
        ) : null}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>↑/↓ navigate · Enter select · Esc close</Text>
      </Box>
    </Box>
  )
}
