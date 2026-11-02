import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
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
import { useEffect, useRef, useState, useCallback } from 'react';
import { palette, ICONS } from "../theme/palette.js";
import { applyMentionInsert, applyOutcome, detectPrefix, emptyBuffer, spillPaste, PASTE_SPILL_THRESHOLD, } from "../runtime/input.js";
/** Render the prompt input row. */
export function Prompt({ busy, contextPct, placeholder, onSubmit, onPrefix, history = [], onAutocompleteMove, onAutocompleteCommit, pendingInsert, autocompleteActive, }) {
    // While a turn runs, typing + Enter steers the live turn instead of
    // queueing for the next one — say so in the placeholder (kiro-style).
    const idlePlaceholder = placeholder ?? 'Type a message, / for commands, @ for tools, ! for shell…';
    const busyPlaceholder = '输入回车即可中途插话，纠正当前回合…';
    const [buffer, setBuffer] = useState(() => emptyBuffer(history));
    const lastInsertSeq = useRef(-1);
    useEffect(() => {
        if (pendingInsert === undefined || pendingInsert.seq === lastInsertSeq.current)
            return;
        lastInsertSeq.current = pendingInsert.seq;
        setBuffer(prev => {
            const text = applyMentionInsert(prev.text, pendingInsert.token, pendingInsert.insert);
            return { ...prev, text, cursor: text.length };
        });
        // The buffer.text effect above re-derives the prefix afterwards.
    }, [pendingInsert]);
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
            return next;
        });
    }, [onSubmit]);
    // Oversized paste (logs, dumps) — whether it lands as one write or many
    // PTY fragments — accumulates in the draft; past the threshold the WHOLE
    // draft spills to .kiro/paste/ and is replaced by a compact @-mention the
    // model can read. Judged on the committed text, so fragments count too.
    useEffect(() => {
        if (buffer.text.length < PASTE_SPILL_THRESHOLD)
            return;
        const spill = spillPaste(buffer.text);
        if (spill === undefined)
            return;
        const kb = Math.max(1, Math.round(spill.bytes / 1024));
        const note = `[粘贴 ${kb}KB → @${spill.mention}] `;
        setBuffer(prev => ({ ...prev, text: note, cursor: note.length }));
    }, [buffer.text]);
    // Prefix notifications follow the committed text (calling a parent setter
    // inside our setBuffer updater rendered-during-render warnings).
    useEffect(() => {
        const prefix = detectPrefix(buffer.text);
        const query = prefix !== undefined ? buffer.text.slice(1) : '';
        onPrefix?.(prefix, query);
    }, [buffer.text, onPrefix]);
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
            if (autocompleteActive === true) {
                onAutocompleteCommit?.();
                return;
            }
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
            // Only when a completion popup is genuinely open — otherwise recall
            // the previous submission (the old check always won because App
            // always passes onAutocompleteMove).
            if (autocompleteActive === true) {
                onAutocompleteMove?.(-1);
                return;
            }
            handle({ kind: 'history-prev' });
            return;
        }
        if (key.downArrow) {
            if (autocompleteActive === true) {
                onAutocompleteMove?.(+1);
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
            // full string and no per-character key flags. A chunk like "/model\r"
            // or "\b\bh" would otherwise be inserted as literal text and clutter
            // the draft. Process each byte: \r/\n submit the draft, backspace/
            // delete bytes cancel the most recent character, everything else
            // becomes a typed character.
            if (input.length > 1 && /[\b\x7f\r\n]/.test(input)) {
                const chars = [...input];
                for (let i = 0; i < chars.length; i += 1) {
                    const ch = chars[i];
                    if (ch !== '\r' && ch !== '\n') {
                        if (ch === '\b' || ch === '\x7f')
                            handle({ kind: 'backspace' });
                        else
                            handle({ kind: 'insert', text: ch });
                        continue;
                    }
                    // A trailing run of CR/LF (nothing but CR/LF after it) is a typed
                    // Enter that the PTY batched with the keystrokes -> submit. A
                    // newline EMBEDDED between content is a paste: keep it in the
                    // draft so oversized-paste spill judges the whole payload.
                    const rest = chars.slice(i + 1);
                    const trailingOnly = rest.every((c) => c === '\r' || c === '\n');
                    if (trailingOnly) {
                        handle({ kind: 'submit', text: buffer.text, images: buffer.images });
                        break;
                    }
                    handle({ kind: 'newline' });
                }
                return;
            }
            // Note: a single "\r" chunk arrives as key.return above (mapKey);
            // a single control char here means a plain text byte.
            handle({ kind: 'insert', text: input });
        }
    }, { isActive: true });
    const draft = buffer.text;
    const prefix = detectPrefix(draft);
    const placeholderText = draft === '' ? (busy ? busyPlaceholder : idlePlaceholder) : '';
    // Kiro-style single input line: `55% > draft` with the REAL terminal
    // cursor shown at its end. Ink hides the cursor on every frame; this
    // trailing show-cursor escape re-shows it and lands it right after the
    // draft, so the terminal (and the IME preedit/candidate window) anchors
    // inside the input line instead of at the bottom of the live region.
    const SHOW_CURSOR = '\u001b[?25h';
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [buffer.images.length > 0 ? (_jsx(Box, { flexDirection: "row", children: _jsxs(Text, { dimColor: true, children: ["[", buffer.images.length, " pending image(s)]"] }) })) : null, _jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: (contextPct !== undefined ? palette.dim(`${contextPct}% `) : '') + (busy ? palette.warning(`${ICONS.agent} `) : palette.accent('> ')) }), _jsx(Box, { flexGrow: 1, flexDirection: "row", children: draft === '' && placeholderText !== '' ? (
                        // Empty draft: the cursor belongs right after `> ` — INSIDE the
                        // placeholder Text, prefixing it (an escape-only leading sibling
                        // Text gets dropped by Ink's text squashing). The IME anchor then
                        // sits where typing starts, not at the end of the hint text.
                        _jsx(Text, { dimColor: true, children: SHOW_CURSOR + placeholderText })) : (
                        // The show-cursor escape sits AT the logical cursor position, so
                        // ←/→/Home/End move the REAL terminal cursor (and the IME anchor)
                        // through the text — it is the caret. ONE string child: inserting
                        // a <Text> child before others makes Ink drop the sibling.
                        _jsx(Text, { children: draft.slice(0, buffer.cursor) + SHOW_CURSOR + draft.slice(buffer.cursor) })) })] })] }));
}
//# sourceMappingURL=Prompt.js.map