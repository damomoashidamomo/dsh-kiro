import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { Box, Text, useInput } from 'ink';
import { useState, useCallback } from 'react';
import { palette, ICONS } from "../theme/palette.js";
import { applyOutcome, detectPrefix, emptyBuffer, } from "../runtime/input.js";
/** Render the prompt input row. */
export function Prompt({ busy, placeholder = 'Type a message, / for commands, @ for tools, ! for shell…', onSubmit, onPrefix, history = [], onAutocompleteMove, onAutocompleteCommit, }) {
    const [buffer, setBuffer] = useState(() => emptyBuffer(history));
    const handle = useCallback((outcome) => {
        setBuffer(prev => {
            const next = applyOutcome(prev, outcome);
            // The TUI prompt is a single-line shell: every keystroke that mutates
            // the text also snaps the cursor to the end. Without this, the forward-
            // delete key (the macOS "Delete" / "Backspace" key, which sends \x7f
            // and reports as key.delete in Ink) would be a no-op whenever the
            // cursor is already at the end of the draft, and the same keypress on
            // Linux would delete the wrong character. Snapping makes backspace
            // and forward-delete behave identically from the user's perspective.
            if (outcome.kind === 'insert'
                || outcome.kind === 'backspace'
                || outcome.kind === 'delete'
                || outcome.kind === 'newline') {
                const prefix = detectPrefix(next.text);
                const query = prefix !== undefined ? next.text.slice(1) : '';
                onPrefix?.(prefix, query);
                return { ...next, cursor: next.text.length };
            }
            if (outcome.kind === 'submit') {
                const text = prev.text.trim();
                const images = prev.images;
                if (text === '' && images.length === 0)
                    return prev;
                Promise.resolve().then(() => onSubmit(text, images));
                return emptyBuffer(next.history);
            }
            const prefix = detectPrefix(next.text);
            const query = prefix !== undefined ? next.text.slice(1) : '';
            onPrefix?.(prefix, query);
            return next;
        });
    }, [onSubmit, onPrefix]);
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
            handle({ kind: 'backspace' });
            return;
        }
        if (key.return && !key.shift) {
            handle({ kind: 'submit', text: buffer.text.trim(), images: buffer.images });
            return;
        }
        if (key.return && key.shift) {
            handle({ kind: 'newline' });
            return;
        }
        if (key.tab && !key.shift) {
            onAutocompleteCommit?.();
            return;
        }
        if (key.leftArrow && key.meta) {
            handle({ kind: 'cursor-left', word: true });
            return;
        }
        if (key.rightArrow && key.meta) {
            handle({ kind: 'cursor-right', word: true });
            return;
        }
        if (key.leftArrow) {
            handle({ kind: 'cursor-left', word: false });
            return;
        }
        if (key.rightArrow) {
            handle({ kind: 'cursor-right', word: false });
            return;
        }
        if (key.upArrow) {
            if (onAutocompleteMove !== undefined) {
                onAutocompleteMove(-1);
                return;
            }
            handle({ kind: 'history-prev' });
            return;
        }
        if (key.downArrow) {
            if (onAutocompleteMove !== undefined) {
                onAutocompleteMove(+1);
                return;
            }
            handle({ kind: 'history-next' });
            return;
        }
        if (key.ctrl && input === 'a') {
            handle({ kind: 'cursor-home' });
            return;
        }
        if (key.ctrl && input === 'e') {
            handle({ kind: 'cursor-end' });
            return;
        }
        // Any other Ctrl-chord is a global shortcut (handled in App.tsx via
        // mapKey); let it propagate instead of swallowing it here.
        if (key.ctrl)
            return;
        if (key.escape || key.pageUp || key.pageDown || key.meta) {
            return;
        }
        if (input.length > 0) {
            // When the terminal delivers a multi-byte chunk (PTY batching, fast
            // key-repeat, some keyboard layouts), Ink fires useInput once with the
            // full string and no per-character key flags. A chunk like "\b\bh" or
            // "\x7fh" would otherwise be inserted as literal text and clutter the
            // draft. Process each byte: backspace/delete bytes cancel the most
            // recent character; everything else becomes a typed character.
            if (input.length > 1 && /[\b\x7f]/.test(input)) {
                for (const ch of input) {
                    if (ch === '\b' || ch === '\x7f') {
                        handle({ kind: 'backspace' });
                    }
                    else {
                        handle({ kind: 'insert', text: ch });
                    }
                }
            }
            else {
                handle({ kind: 'insert', text: input });
            }
        }
    }, { isActive: true });
    const draft = buffer.text;
    const prefix = detectPrefix(draft);
    const placeholderText = draft === '' ? placeholder : '';
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, paddingX: 1, marginTop: 1, children: [_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: busy ? palette.warning(`${ICONS.agent} `) : palette.accent('> ') }), _jsx(Box, { flexGrow: 1, flexDirection: "row", children: prefix !== undefined ? (_jsxs(Text, { children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: prefix }), _jsx(Text, { children: draft.slice(1) || palette.muted('_') })] })) : draft === '' && placeholderText !== '' ? (_jsx(Text, { dimColor: true, children: placeholderText })) : (_jsx(Text, { children: draft || palette.muted('_') })) })] }), buffer.images.length > 0 ? (_jsx(Box, { marginTop: 1, flexDirection: "row", children: _jsxs(Text, { dimColor: true, children: ["[", buffer.images.length, " pending image(s)]"] }) })) : null] }));
}
//# sourceMappingURL=Prompt.js.map