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

import { Box, Text, useInput, useStdout } from 'ink'
import { useEffect, useRef, useState, useCallback } from 'react'
import { palette, ICONS } from '../theme/palette'
import { displayWidth, stripAnsi, wrapAnsi } from '../markdown/render'
import { STRINGS } from './strings'
import {
  applyMentionInsert,
  applyOutcome,
  foldInputChunk,
  detectPrefix,
  emptyBuffer,
  spillPaste,
  PASTE_SPILL_THRESHOLD,
  type InputOutcome,
  type PendingImage,
  type PromptBuffer,
} from '../runtime/input'

export interface PromptProps {
  /** Whether the agent is currently processing a turn. */
  readonly busy: boolean
  /** Context usage percent (0-100) rendered left of the gutter, kiro-style. */
  readonly contextPct?: number
  /** True while contextPct is a replay-based estimate (resumed session). */
  readonly contextApprox?: boolean
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
  readonly pendingInsert?: { readonly token: string; readonly insert: string; readonly seq: number; readonly clearAll?: boolean } | undefined
  /**
   * An autocomplete popup is open: Enter commits the highlighted entry
   * instead of submitting the draft (kiro-style).
   */
  readonly autocompleteActive?: boolean
  /**
   * True while an autocomplete popup renders BELOW the prompt: the real
   * caret must not be positioned then (the jump targets the frame's last
   * line, which is the popup's border, and the cursor would sit there).
   */
  readonly popupOpen?: boolean
}

/** Render the prompt input row. */
export function Prompt({
  busy,
  contextPct,
  contextApprox,
  popupOpen,
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
  const idlePlaceholder = placeholder ?? STRINGS.prompt.idlePlaceholder
  const busyPlaceholder = STRINGS.prompt.busyPlaceholder
  const [buffer, setBuffer] = useState<PromptBuffer>(() => emptyBuffer(history))
  const lastInsertSeq = useRef(-1)
  useEffect(() => {
    if (pendingInsert === undefined || pendingInsert.seq === lastInsertSeq.current) return
    lastInsertSeq.current = pendingInsert.seq
    if (pendingInsert.clearAll === true) {
      setBuffer(prev => ({ ...prev, text: '', cursor: 0 }))
      return
    }
    setBuffer(prev => {
      const text = applyMentionInsert(prev.text, pendingInsert.token, pendingInsert.insert)
      return { ...prev, text, cursor: text.length }
    })
    // The buffer.text effect above re-derives the prefix afterwards.
  }, [pendingInsert])

  const handle = useCallback((outcome: InputOutcome) => {
    setBuffer(prev => {
      const next = applyOutcome(prev, outcome)
      // No cursor snapping: the real terminal caret is POSITIONED at
      // buffer.cursor every frame (see the render below), so edits keep the
      // caret where applyOutcome puts it — insert grows it by the inserted
      // length, backspace steps it left, word jumps land on boundaries. (The
      // old snap-to-end was a workaround from before the caret could move.)
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

  // Oversized paste (logs, dumps) — whether it lands as one write or many
  // PTY fragments — accumulates in the draft; past the threshold the WHOLE
  // draft spills to .kiro/paste/ and is replaced by a compact @-mention the
  // model can read. Judged on the committed text, so fragments count too.
  useEffect(() => {
    if (buffer.text.length < PASTE_SPILL_THRESHOLD) return
    const spill = spillPaste(buffer.text)
    if (spill === undefined) return
    const kb = Math.max(1, Math.round(spill.bytes / 1024))
    const note = `[粘贴 ${kb}KB → @${spill.mention}] `
    setBuffer(prev => ({ ...prev, text: note, cursor: note.length }))
  }, [buffer.text])

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
    // home/end arrive as key flags via the dsh-kiro ink patch (upstream
    // useInput never surfaced them even though parse-keypress parses the
    // sequences); the type just lags behind.
    const kx = key as typeof key & { home?: boolean; end?: boolean }
    if (kx.home === true) {
      handle({ kind: 'cursor-home' })
      return
    }
    if (kx.end === true) {
      handle({ kind: 'cursor-end' })
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
      // Only when a completion popup is genuinely open — otherwise recall
      // the previous submission (the old check always won because App
      // always passes onAutocompleteMove).
      if (autocompleteActive === true) {
        onAutocompleteMove?.(-1)
        return
      }
      handle({ kind: 'history-prev' })
      return
    }
    if (key.downArrow) {
      if (autocompleteActive === true) {
        onAutocompleteMove?.(+1)
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
      for (const action of foldInputChunk(input, buffer.text)) {
        if (action.kind === 'submit') {
          handle({ kind: 'submit', text: buffer.text, images: buffer.images })
          break
        }
        handle(action)
      }
    }
  }, { isActive: true })

  const draft = buffer.text
  const prefix = detectPrefix(draft)
  const placeholderText = draft === '' ? (busy ? busyPlaceholder : idlePlaceholder) : ''

  // Kiro-style single input line: `55% > draft` with the REAL terminal
  // cursor parked AT the logical caret. The caret cannot be positioned with
  // an in-band escape (the terminal cursor always ends up wherever the frame
  // write STOPPED, i.e. the end of the last line), so this component:
  //   1. pre-wraps the whole input line itself (Ink never re-wraps it), so
  //      the caret's visual line/column are exactly computable, and
  //   2. publishes them on globalThis.__kiroCaret; the patched ink
  //      log-update emits the relative moves (up · CR · col · show) AFTER
  //      each frame write and undoes them before the next erase.
  const { stdout } = useStdout()
  const columns = Math.max(20, stdout?.columns ?? 80)
  // Gutter colors are applied with ANSI so the DRAFT text after it stays
  // uncolored — putting the whole pre-wrapped line in one color=<green> Text
  // turned the user's input green.
  const gutter =
    (contextPct !== undefined ? palette.dim(`${contextApprox === true ? STRINGS.prompt.approxPrefix : ''}${contextPct}% `) : '')
    + (busy ? palette.warning(`${ICONS.agent} `) : palette.success('> '))
  const gutterWidth = displayWidth(gutter)
  const body = draft === '' && placeholderText !== ''
    ? palette.muted(placeholderText)
    : draft
  const line = gutter + body
  const lines = wrapAnsi(line, columns)
  const caretAbs = gutterWidth + displayWidth(draft === '' && placeholderText !== '' ? '' : draft.slice(0, buffer.cursor))
  let acc = 0
  let caretUp = 0
  let caretCol = 0
  for (let i = 0; i < lines.length; i++) {
    const w = displayWidth(stripAnsi(lines[i] ?? ''))
    if (caretAbs <= acc + w || i === lines.length - 1) {
      caretCol = Math.min(caretAbs - acc, w)
      caretUp = lines.length - 1 - i
      break
    }
    acc += w
  }
  ;(globalThis as { __kiroCaret?: { up: number; col: number } }).__kiroCaret = popupOpen === true
    ? undefined
    : { up: caretUp, col: caretCol }
  useEffect(() => () => {
    // When an overlay replaces the Prompt, its stale caret must not keep
    // pulling the terminal cursor to a line that no longer exists.
    ;(globalThis as { __kiroCaret?: { up: number; col: number } }).__kiroCaret = undefined
  }, [])

  return (
    <Box flexDirection="column" marginTop={1}>
      {buffer.images.length > 0 ? (
        <Box flexDirection="row">
          <Text dimColor>[{buffer.images.length} pending image(s)]</Text>
        </Box>
      ) : null}
      {/* ONE string child (never a null → <Text> insert: Ink drops the
          following sibling) — the pre-wrapped input lines joined by newlines
          keep Ink from re-wrapping, so the caret math above stays exact. */}
      <Text>{lines.join('\n')}</Text>
    </Box>
  )
}
