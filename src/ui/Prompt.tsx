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
import { useEffect, useRef, useState, useCallback } from 'react'
import { palette, ICONS } from '../theme/palette'
import {
  applyMentionInsert,
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
  /** Context usage percent (0-100) rendered left of the gutter, kiro-style. */
  readonly contextPct?: number
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
  /**
   * Insert a picked `@`-mention into the draft (path completion): the
   * trailing query token is replaced by `insert` plus a space. Bumping the
   * seq applies it once; the same seq is ignored.
   */
  readonly pendingInsert?: { readonly token: string; readonly insert: string; readonly seq: number } | undefined
  /**
   * An autocomplete popup is open: Enter commits the highlighted entry
   * instead of submitting the draft (kiro-style).
   */
  readonly autocompleteActive?: boolean
}

/** Render the prompt input row. */
export function Prompt({
  busy,
  contextPct,
  placeholder,
  onSubmit,
  onPrefix,
  history = [],
  onAutocompleteMove,
  onAutocompleteCommit,
  pendingInsert,
  autocompleteActive,
}: PromptProps): JSX.Element {
  // While a turn runs, typing + Enter steers the live turn instead of
  // queueing for the next one — say so in the placeholder (kiro-style).
  const idlePlaceholder = placeholder ?? 'Type a message, / for commands, @ for tools, ! for shell…'
  const busyPlaceholder = '输入回车即可中途插话，纠正当前回合…'
  const [buffer, setBuffer] = useState<PromptBuffer>(() => emptyBuffer(history))
  const lastInsertSeq = useRef(-1)
  useEffect(() => {
    if (pendingInsert === undefined || pendingInsert.seq === lastInsertSeq.current) return
    lastInsertSeq.current = pendingInsert.seq
    setBuffer(prev => {
      const text = applyMentionInsert(prev.text, pendingInsert.token, pendingInsert.insert)
      return { ...prev, text, cursor: text.length }
    })
    // The buffer.text effect above re-derives the prefix afterwards.
  }, [pendingInsert])

  const handle = useCallback((outcome: InputOutcome) => {
    setBuffer(prev => {
      const next = applyOutcome(prev, outcome)
      // The TUI prompt is a single-line shell: every keystroke that mutates
      // the text also snaps the cursor to the end. Without this, the forward-
      // delete key (the macOS "Delete" / "Backspace" key, which sends \x7f
      // and reports as key.delete in Ink) would be a no-op whenever the
      // cursor is already at the end of the draft, and the same keypress on
      // Linux would delete the wrong character. Snapping makes backspace
      // and forward-delete behave identically from the user's perspective.
      if (
        outcome.kind === 'insert'
        || outcome.kind === 'backspace'
        || outcome.kind === 'delete'
        || outcome.kind === 'newline'
      ) {
        return { ...next, cursor: next.text.length }
      }
      if (outcome.kind === 'submit') {
        const text = prev.text.trim()
        const images = prev.images
        if (text === '' && images.length === 0) return prev
        Promise.resolve().then(() => onSubmit(text, images))
        return emptyBuffer(next.history)
      }
      return next
    })
  }, [onSubmit])

  // Prefix notifications follow the committed text (calling a parent setter
  // inside our setBuffer updater rendered-during-render warnings).
  useEffect(() => {
    const prefix = detectPrefix(buffer.text)
    const query = prefix !== undefined ? buffer.text.slice(1) : ''
    onPrefix?.(prefix, query)
  }, [buffer.text, onPrefix])

  useInput((input, key) => {
    // Backspace / delete handling must run BEFORE the modifier shortcuts
    // below, otherwise a Ctrl-modified keystroke (Ctrl+H from WSL, etc.)
    // gets swallowed by the general modifier early-returns and the user
    // cannot edit the draft.
    //
    // Both `key.backspace` (Ctrl+H / Linux / Windows Terminal) and
    // `key.delete` (macOS, the "Delete" key that sends \x7f) are treated
    // as "delete the char before the cursor" — in a single-line prompt
    // that means deleting the last typed character from either end, since
    // the handle() callback snaps the cursor to the end on every edit.
    if (key.backspace || key.delete || input === '\b' || input === '\x7f') {
      handle({ kind: 'backspace' })
      return
    }
    if (key.return && !key.shift) {
      if (autocompleteActive === true) {
        onAutocompleteCommit?.()
        return
      }
      handle({ kind: 'submit', text: buffer.text.trim(), images: buffer.images })
      return
    }
    if (key.return && key.shift) {
      handle({ kind: 'newline' })
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
    // Any other Ctrl-chord is a global shortcut (handled in App.tsx via
    // mapKey); let it propagate instead of swallowing it here.
    if (key.ctrl) return
    if (key.escape || key.pageUp || key.pageDown || key.meta) {
      return
    }
    if (input.length > 0) {
      // When the terminal delivers a multi-byte chunk (PTY batching, fast
      // key-repeat, some keyboard layouts), Ink fires useInput once with the
      // full string and no per-character key flags. A chunk like "/model\r"
      // or "\b\bh" would otherwise be inserted as literal text and clutter
      // the draft. Process each byte: \r/\n submit the draft, backspace/
      // delete bytes cancel the most recent character, everything else
      // becomes a typed character.
      if (input.length > 1 && /[\b\x7f\r\n]/.test(input)) {
        for (const ch of input) {
          if (ch === '\r' || ch === '\n') {
            handle({ kind: 'submit', text: buffer.text, images: buffer.images })
          } else if (ch === '\b' || ch === '\x7f') {
            handle({ kind: 'backspace' })
          } else {
            handle({ kind: 'insert', text: ch })
          }
        }
        return
      }
      // Note: a single "\r" chunk arrives as key.return above (mapKey);
      // a single control char here means a plain text byte.
      handle({ kind: 'insert', text: input })
    }
  }, { isActive: true })

  const draft = buffer.text
  const prefix = detectPrefix(draft)
  const placeholderText = draft === '' ? (busy ? busyPlaceholder : idlePlaceholder) : ''

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={palette.enabled ? 'green' : undefined} paddingX={1} marginTop={1}>
      <Box flexDirection="row">
        <Text color={palette.enabled ? 'green' : undefined}>
          {contextPct !== undefined ? <Text dimColor>{`${contextPct}% `}</Text> : null}
          {busy ? palette.warning(`${ICONS.agent} `) : palette.accent('> ')}
        </Text>
        <Box flexGrow={1} flexDirection="row">
          {prefix !== undefined ? (
            <Text>
              <Text color={palette.enabled ? 'green' : undefined}>{prefix}</Text>
              <Text>{draft.slice(1) || palette.muted('_')}</Text>
            </Text>
          ) : draft === '' && placeholderText !== '' ? (
            <Text dimColor>{placeholderText}</Text>
          ) : (
            <Text>{draft || palette.muted('_')}</Text>
          )}
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
