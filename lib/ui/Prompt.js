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
        if (key.backspace || key.delete || input === '\b' || input === '\x7f') {
            handle(key.delete ? { kind: 'delete' } : { kind: 'backspace' });
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
            handle({ kind: 'insert', text: input });
        }
    }, { isActive: true });
    const draft = buffer.text;
    const prefix = detectPrefix(draft);
    const placeholderText = draft === '' ? placeholder : '';
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, paddingX: 1, marginTop: 1, children: [_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: busy ? palette.warning(`${ICONS.agent} `) : palette.accent('> ') }), _jsx(Box, { flexGrow: 1, flexDirection: "row", children: prefix !== undefined ? (_jsxs(Text, { children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: prefix }), _jsx(Text, { children: draft.slice(1) || palette.muted('_') })] })) : draft === '' && placeholderText !== '' ? (_jsx(Text, { dimColor: true, children: placeholderText })) : (_jsx(Text, { children: draft || palette.muted('_') })) })] }), buffer.images.length > 0 ? (_jsx(Box, { marginTop: 1, flexDirection: "row", children: _jsxs(Text, { dimColor: true, children: ["[", buffer.images.length, " pending image(s)]"] }) })) : null] }));
}
//# sourceMappingURL=Prompt.js.map