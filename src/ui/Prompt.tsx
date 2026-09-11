/**
 * Prompt — the multi-line input row at the bottom of the screen.
 *
 * Uses Ink's `useInput` to capture keystrokes and feeds them into the
 * framework-agnostic PromptBuffer (see `runtime/input.ts`). The visual layer
 * is intentionally plain: an `>` gutter in the accent color, the draft text,
 * and a placeholder when empty.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Prompt
 */

import { Box, Text, useInput } from 'ink'
import { useState, useCallback } from 'react'
import { palette, ICONS } from '../theme/palette'
import {
  applyOutcome,
  detectPrefix,
  emptyBuffer,
  type InputOutcome,
  type PendingImage,
  type PromptBuffer,
} from '../runtime/input'

export interface PromptProps {
  /** Whether the agent is currently processing a turn. */
  readonly busy: boolean
  /** Placeholder when the draft is empty. */
  readonly placeholder?: string
  /** Submit handler — receives the trimmed text and pending images. */
  readonly onSubmit: (text: string, images: readonly PendingImage[]) => void
  /** Notify the parent when a special prefix is active (`/`, `@`, `!`). */
  readonly onPrefix?: (prefix: '/' | '@' | '!' | undefined, query: string) => void
  /** Initial history to seed the buffer with. */
  readonly history?: readonly string[]
  /** Move the autocomplete highlight by `delta` (typically ±1 on arrow keys). */
  readonly onAutocompleteMove?: (delta: number) => void
  /** Commit the currently highlighted autocomplete entry. */
  readonly onAutocompleteCommit?: () => void
}

/** Render the prompt input row. */
export function Prompt({
  busy,
  placeholder = 'Type a message, / for commands, @ for tools, ! for shell…',
  onSubmit,
  onPrefix,
  history = [],
  onAutocompleteMove,
  onAutocompleteCommit,
}: PromptProps): JSX.Element {
  const [buffer, setBuffer] = useState<PromptBuffer>(() => emptyBuffer(history))

  const handle = useCallback((outcome: InputOutcome) => {
    setBuffer(prev => {
      const next = applyOutcome(prev, outcome)
      if (outcome.kind === 'submit') {
        const text = prev.text.trim()
        const images = prev.images
        if (text === '' && images.length === 0) return prev
        Promise.resolve().then(() => onSubmit(text, images))
        return emptyBuffer(next.history)
      }
      const prefix = detectPrefix(next.text)
      const query = prefix !== undefined ? next.text.slice(1) : ''
      onPrefix?.(prefix, query)
      return next
    })
  }, [onSubmit, onPrefix])

  useInput((input, key) => {
    if (key.return && !key.shift) {
      handle({ kind: 'submit', text: buffer.text.trim(), images: buffer.images })
      return
    }
    if (key.return && key.shift) {
      handle({ kind: 'newline' })
      return
    }
    if (key.backspace || key.delete || input === '\b' || input === '\x7f') {
      handle(key.delete ? { kind: 'delete' } : { kind: 'backspace' })
      return
    }
    if (key.tab && !key.shift) {
      onAutocompleteCommit?.()
      return
    }
    if (key.leftArrow && key.meta) {
      handle({ kind: 'cursor-left', word: true })
      return
    }
    if (key.rightArrow && key.meta) {
      handle({ kind: 'cursor-right', word: true })
      return
    }
    if (key.leftArrow) {
      handle({ kind: 'cursor-left', word: false })
      return
    }
    if (key.rightArrow) {
      handle({ kind: 'cursor-right', word: false })
      return
    }
    if (key.upArrow) {
      if (onAutocompleteMove !== undefined) {
        onAutocompleteMove(-1)
        return
      }
      handle({ kind: 'history-prev' })
      return
    }
    if (key.downArrow) {
      if (onAutocompleteMove !== undefined) {
        onAutocompleteMove(+1)
        return
      }
      handle({ kind: 'history-next' })
      return
    }
    if (key.ctrl && input === 'a') {
      handle({ kind: 'cursor-home' })
      return
    }
    if (key.ctrl && input === 'e') {
      handle({ kind: 'cursor-end' })
      return
    }
    if (key.ctrl) {
      return
    }
    if (key.escape || key.pageUp || key.pageDown || key.meta) {
      return
    }
    if (input.length > 0) {
      handle({ kind: 'insert', text: input })
    }
  }, { isActive: true })

  const draft = buffer.text
  const prefix = detectPrefix(draft)
  const placeholderText = draft === '' ? placeholder : ''
  const lines = draft.split('\n')
  const cursorLine = lines.length - 1
  void cursorLine

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={palette.enabled ? 'green' : undefined} paddingX={1} marginTop={1}>
      <Box flexDirection="row">
        <Text color={palette.enabled ? 'green' : undefined}>
          {busy ? palette.warning(`${ICONS.agent} `) : palette.accent('> ')}
        </Text>
        <Box flexGrow={1} flexDirection="row">
          <Text>
            {prefix !== undefined ? (
              <>
                <Text color={palette.enabled ? 'green' : undefined}>{prefix}</Text>
                <Text>{draft.slice(1) || palette.muted('_')}</Text>
              </>
            ) : draft === '' && placeholderText !== '' ? (
              <Text dimColor>{placeholderText}</Text>
            ) : (
              <Text>{draft || palette.muted('_')}</Text>
            )}
          </Text>
        </Box>
      </Box>
      {buffer.images.length > 0 ? (
        <Box marginTop={1} flexDirection="row">
          <Text dimColor>[{buffer.images.length} pending image(s)]</Text>
        </Box>
      ) : null}
    </Box>
  )
}
