import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Panel for a pending structured question — plan review (`exit_plan_mode`)
 * and generic asks. Mirrors the approval panel's key model: number keys
 * direct-select, ↑↓+Enter list select, Esc dismisses (the model is told to
 * stay and wait for the user's own words), Ctrl+C stays with the App's
 * two-stage interrupt (cancels the turn, which aborts the question).
 *
 * Plan-review extra: choosing a NON-approve option opens a one-line
 * optional feedback input whose text goes back to the model (custom).
 * An approve selection never carries text (platform contract). Questions
 * without options are free-text only (custom answer, empty list).
 *
 * @module @damomoashidamomo/dsh-kiro/ui/plan-review-overlay
 */
import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { palette } from "../theme/palette.js";
import { displayWidth, wrapAnsi } from "../markdown/render.js";
/** Cap on rendered detail (plan markdown) lines before an ellipsis marker. */
const DETAIL_LINE_CAP = 14;
export function PlanReviewOverlay({ request, onResolve }) {
    const options = request.options;
    const [highlighted, setHighlighted] = useState(0);
    const isPlanReview = request.approveLabel !== undefined;
    // Local (non-state) buffers fold PTY-batched chunks, like the approval
    // panel: React state set inside the synchronous key loop would not be
    // visible to later bytes of the same chunk.
    const [textMode, setTextMode] = useState(options.length === 0);
    const [text, setText] = useState('');
    const submit = (selected, custom) => {
        onResolve({ kind: 'answer', selected, custom });
    };
    useInput((input, key) => {
        // Fold PTY-batched chunks through LOCAL mode/buffer/index state (React
        // state writes inside one synchronous loop are not visible to later
        // bytes of the same chunk); committed state catches up at the end.
        const submitText = (buffer, index) => {
            const trimmed = buffer.trim();
            if (options.length === 0) {
                submit([], trimmed === '' ? undefined : trimmed);
                return;
            }
            const chosen = options[index]?.label;
            if (chosen !== undefined)
                submit([chosen], trimmed === '' ? undefined : trimmed);
            else
                submit([], trimmed === '' ? undefined : trimmed);
            // ^ index sits on the ✏️ 自定义输入 row (or out of range): the typed text
            //   IS the answer. It used to be swallowed silently here — the user typed
            //   a custom answer, pressed Enter, and the panel just bounced back to
            //   the option menu with the text lost.
        };
        const pick = (index) => {
            const chosen = options[index]?.label;
            if (chosen === undefined) {
                setTextMode(true);
                return;
            }
            if (isPlanReview && chosen !== request.approveLabel) {
                setHighlighted(index);
                setTextMode(true);
                return;
            }
            submit([chosen], undefined);
        };
        if (input === '') {
            // Single key event (Enter/arrows/Esc/backspace arrive parsed).
            if (textMode) {
                if (key.return)
                    submitText(text, highlighted);
                else if (key.escape) {
                    setTextMode(false);
                    setText('');
                }
                else if (key.delete || key.backspace)
                    setText((prev) => prev.slice(0, -1));
                return;
            }
            // Generic questions get an extra 「自定义输入」 row after the options
            // (b2): pick it to answer with free text instead of a listed option.
            const navBounds = isPlanReview ? options.length : options.length + 1;
            if (key.return)
                pick(highlighted);
            else if (key.upArrow)
                setHighlighted((prev) => (prev - 1 + navBounds) % navBounds);
            else if (key.downArrow)
                setHighlighted((prev) => (prev + 1) % navBounds);
            else if (key.escape)
                onResolve({ kind: 'dismissed' });
            return;
        }
        // Printable run (may embed CR or DEL bytes — fold byte by byte).
        let mode = textMode;
        let buffer = text;
        let index = highlighted;
        for (const ch of input) {
            if (mode) {
                if (ch === '\r' || ch === '\n') {
                    setTextMode(false);
                    submitText(buffer, index);
                    return;
                }
                if (ch === '\x1b') {
                    setTextMode(false);
                    setText('');
                    return;
                }
                if (ch === '\b' || ch === '\x7f')
                    buffer = buffer.slice(0, -1);
                else if (ch >= ' ')
                    buffer += ch;
                continue;
            }
            if (ch === '\x1b') {
                onResolve({ kind: 'dismissed' });
                return;
            }
            if (ch === '\r' || ch === '\n') {
                pick(index);
                return;
            }
            const direct = Number.parseInt(ch, 10);
            if (!isPlanReview && direct === options.length + 1 && options.length > 0) {
                // 「✏️ 自定义输入」 row: jump straight into the free-text field.
                index = options.length;
                setHighlighted(index);
                mode = true;
                buffer = '';
                continue;
            }
            if (Number.isInteger(direct) && direct >= 1 && direct <= options.length) {
                const label = options[direct - 1]?.label;
                if (label !== undefined && isPlanReview && label !== request.approveLabel) {
                    index = direct - 1;
                    setHighlighted(index);
                    mode = true;
                    buffer = '';
                    continue;
                }
                if (label !== undefined) {
                    submit([label], undefined);
                    return;
                }
            }
        }
        setTextMode(mode);
        setText(buffer);
    });
    // Publish the REAL terminal caret while the panel is in text mode (same
    // contract as Prompt → ink patch reads globalThis.__kiroCaret). Without this
    // the cursor fell below the panel, onto the prompt line — typing LOOKED like
    // it went to the wrong place.
    useEffect(() => {
        const g = globalThis;
        if (!textMode) {
            g.__kiroCaret = undefined;
            return;
        }
        const prefix = options.length === 0 ? '回答：' : '反馈（可选）：';
        const innerWidth = Math.max(12, (process.stdout.columns ?? 80) - 4);
        const lines = wrapAnsi(prefix + text, innerWidth);
        const last = lines[lines.length - 1] ?? '';
        g.__kiroCaret = { up: 1 + (lines.length - 1), col: displayWidth(last) };
        return () => {
            g.__kiroCaret = undefined;
        };
    }, [textMode, text, options.length]);
    const detailLines = (request.detail ?? '').split('\n');
    const detailShown = detailLines.slice(0, DETAIL_LINE_CAP);
    const detailEllipsized = detailLines.length > DETAIL_LINE_CAP;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, children: [_jsx(Text, { bold: true, children: palette.warning(isPlanReview ? '📋 计划评审' : (request.header ?? '❓ 需要你的回答')) }), _jsx(Text, { children: request.question }), request.detail !== undefined && request.detail !== '' ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [detailShown.map((line, index) => (_jsx(Text, { dimColor: !line.startsWith('#'), children: line === '' ? ' ' : line }, index))), detailEllipsized ? (_jsxs(Text, { dimColor: true, children: ["\u2026\uFF08", detailLines.length - DETAIL_LINE_CAP, " \u884C\u672A\u663E\u793A\uFF09"] })) : null] })) : null, options.length > 0 ? (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [options.map((option, index) => (_jsxs(Text, { color: index === highlighted ? 'yellow' : undefined, children: [index === highlighted ? '❯ ' : '  ', index + 1, " ", option.label, option.description !== undefined ? _jsxs(Text, { dimColor: true, children: [" \u2014 ", option.description] }) : null] }, option.label))), !isPlanReview ? (_jsxs(Text, { color: highlighted === options.length ? 'yellow' : undefined, children: [highlighted === options.length ? '❯ ' : '  ', options.length + 1, " \u270F\uFE0F \u81EA\u5B9A\u4E49\u8F93\u5165\u2026"] })) : null] })) : null, textMode ? (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: [options.length === 0 ? '回答：' : '反馈（可选）：', _jsx(Text, { color: "green", children: text })] }) })) : (_jsx(Text, { dimColor: true, children: "\u6570\u5B57\u76F4\u9009 \u00B7 \u2191\u2193+Enter \u00B7 Esc=\u63D2\u8BDD\uFF08\u56DE\u5230\u8F93\u5165\u6846\uFF09" }))] }));
}
//# sourceMappingURL=PlanReviewOverlay.js.map