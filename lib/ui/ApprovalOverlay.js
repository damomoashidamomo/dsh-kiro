import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * kiro-style tool-permission panel. Shown in place of the prompt while the
 * platform's approval waterfall waits on this TUI's answerer:
 *
 *   ⚠ 工具需要批准
 *   工具: bash
 *   原因: escalate sandbox to danger-full-access: …
 *
 *   ❯ 1 允许一次
 *     2 本会话始终允许 (bash)
 *     3 拒绝（可填理由）
 *
 * Keys: 1/2/3 pick directly; ↑/↓ + Enter pick kiro-list style; Esc denies
 * without a reason. Choosing 拒绝 switches to a one-line reason input
 * (Enter submits — empty denies outright, Esc denies outright). Ctrl+C is
 * deliberately NOT consumed here: it falls through to the App's interrupt
 * handler and cancels the whole turn, which aborts the approval request.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/ApprovalOverlay
 */
import { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { palette } from "../theme/palette.js";
const OPTIONS = [
    { key: '1', label: '允许一次' },
    { key: '2', label: '本会话始终允许' },
    { key: '3', label: '本项目始终允许（写入 .kiro/approvals.json）' },
    { key: '4', label: '拒绝（可填理由）' },
];
export function ApprovalOverlay(props) {
    const [selected, setSelected] = useState(0);
    const [reasonMode, setReasonMode] = useState(false);
    const [reason, setReason] = useState('');
    useInput((input, key) => {
        // Deny helper: empty/whitespace reason denies outright.
        const denyWith = (text) => {
            const trimmed = text.trim();
            props.onResolve(trimmed === '' ? { kind: 'deny', reason: undefined } : { kind: 'deny', reason: trimmed });
        };
        // React state updates do not apply inside one synchronous loop, so a
        // PTY-batched chunk (`3no\r`) is folded through LOCAL mode/buffer state
        // first; the committed state catches up at the end.
        if (reasonMode) {
            if (input === '') {
                if (key.return) {
                    denyWith(reason);
                }
                else if (key.escape) {
                    props.onResolve({ kind: 'deny', reason: undefined });
                }
                else if (key.delete || key.backspace) {
                    setReason((prev) => prev.slice(0, -1));
                }
                return;
            }
            let buffer = reason;
            let submit = false;
            for (const ch of input) {
                if (ch === '\r' || ch === '\n') {
                    submit = true;
                    break;
                }
                if (ch === '\x1b') {
                    props.onResolve({ kind: 'deny', reason: undefined });
                    return;
                }
                if (ch === '\b' || ch === '\x7f')
                    buffer = buffer.slice(0, -1);
                else if (ch >= ' ')
                    buffer += ch;
            }
            setReason(buffer);
            if (submit)
                denyWith(buffer);
            return;
        }
        const pick = (index) => {
            if (index === 3) {
                setReasonMode(true);
                return;
            }
            if (index === 1)
                props.onResolve({ kind: 'allow-session' });
            else if (index === 2)
                props.onResolve({ kind: 'allow-project' });
            else
                props.onResolve({ kind: 'allow-once' });
        };
        if (input === '') {
            if (key.return)
                pick(selected);
            else if (key.upArrow)
                setSelected((prev) => Math.max(0, prev - 1));
            else if (key.downArrow)
                setSelected((prev) => Math.min(OPTIONS.length - 1, prev + 1));
            else if (key.escape)
                props.onResolve({ kind: 'deny', reason: undefined });
            return;
        }
        // Option mode: a chunk may enter reason mode mid-string (`3no\r`), so
        // keep folding bytes through a local mode/buffer pair.
        let enteringReason = false;
        let buffer = '';
        for (const ch of input) {
            if (enteringReason) {
                if (ch === '\r' || ch === '\n') {
                    denyWith(buffer);
                    return;
                }
                if (ch === '\b' || ch === '\x7f')
                    buffer = buffer.slice(0, -1);
                else if (ch >= ' ' && ch !== '\x1b')
                    buffer += ch;
                continue;
            }
            if (ch === '\x1b') {
                props.onResolve({ kind: 'deny', reason: undefined });
                return;
            }
            if (ch === '\r' || ch === '\n') {
                pick(selected);
                return;
            }
            const direct = OPTIONS.findIndex((option) => option.key === ch);
            if (direct === 3) {
                enteringReason = true;
                continue;
            }
            if (direct >= 0) {
                pick(direct);
                return;
            }
        }
        if (enteringReason) {
            setReason(buffer);
            setReasonMode(true);
        }
    });
    return (_jsxs(Box, { borderStyle: "round", borderColor: "yellow", flexDirection: "column", paddingX: 1, children: [_jsx(Box, { children: _jsx(Text, { children: palette.warning('⚠ 工具需要批准') }) }), _jsxs(Box, { children: [_jsx(Text, { dimColor: true, children: "\u5DE5\u5177: " }), _jsx(Text, { children: palette.accent(props.request.toolName) })] }), props.request.reason !== undefined && props.request.reason !== '' && (_jsxs(Box, { children: [_jsx(Text, { dimColor: true, children: "\u539F\u56E0: " }), _jsx(Text, { wrap: "truncate-end", children: props.request.reason })] })), props.diff !== undefined && props.diff.length > 0 && (_jsx(Box, { flexDirection: "column", marginTop: 1, children: props.diff.map((row, idx) => (_jsx(Text, { wrap: "truncate-end", children: renderDiffRow(row) }, idx))) })), _jsx(Box, { flexDirection: "column", marginTop: 1, children: reasonMode ? (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "\u62D2\u7EDD\u7406\u7531\uFF08\u56DE\u8F66\u63D0\u4EA4\uFF0C\u7559\u7A7A\u76F4\u63A5\u62D2\u7EDD\uFF0CEsc \u76F4\u63A5\u62D2\u7EDD\uFF09\uFF1A" }), _jsx(Text, { children: reason === '' ? palette.muted('…') : reason })] })) : (OPTIONS.map((option, index) => (_jsxs(Box, { children: [_jsx(Text, { children: index === selected ? palette.accent('❯ ') : palette.muted('  ') }), _jsx(Text, { bold: index === selected, children: index === selected
                                ? palette.bold(`${option.key} ${option.label}${option.key === '2' ? ` (${props.request.toolName})` : ''}`)
                                : palette.muted(`${option.key} ${option.label}${option.key === '2' ? ` (${props.request.toolName})` : ''}`) })] }, option.key)))) })] }));
}
/** Color one diff row for the approval panel. */
function renderDiffRow(row) {
    switch (row.kind) {
        case 'add':
            return palette.success(`+ ${row.text}`);
        case 'del':
            return palette.error(`- ${row.text}`);
        case 'hunk':
            return palette.accentSoft(row.text);
        case 'note':
            return palette.muted(row.text);
        default:
            return palette.dim(`  ${row.text}`);
    }
}
//# sourceMappingURL=ApprovalOverlay.js.map