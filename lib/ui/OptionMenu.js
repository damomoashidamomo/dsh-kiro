import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { Box, Text, useInput, useStdout } from 'ink';
import { displayWidth } from "../markdown/render.js";
import { useEffect, useState } from 'react';
import { palette } from "../theme/palette.js";
function clipColumns(text, width) {
    if (width <= 1)
        return text.length > 0 ? '…' : '';
    let used = 0;
    let out = '';
    for (const ch of text) {
        const w = displayWidth(ch);
        if (used + w > width - 1)
            return `${out}…`;
        used += w;
        out += ch;
    }
    return out;
}
export function OptionMenu({ title, options, onPick, onCancel }) {
    const [cursor, setCursor] = useState(0);
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 100;
    const terminalRows = stdout?.rows ?? 30;
    useEffect(() => {
        setCursor(0);
    }, [title]);
    // Window the rows so a long menu (/chat with 20 sessions) never pushes the
    // border, title or footer off a short terminal. The window follows the
    // cursor, and the numbering stays ABSOLUTE so number keys keep working.
    const budget = Math.max(4, terminalRows - 6); // border 2, title 1, footer 1, prompt 2
    const windowed = options.length > budget;
    const start = windowed
        ? Math.min(Math.max(0, cursor - budget + 2), Math.max(0, options.length - budget))
        : 0;
    const visible = windowed ? options.slice(start, start + budget) : options;
    const hiddenAbove = start;
    const hiddenBelow = Math.max(0, options.length - (start + visible.length));
    useInput((input, key) => {
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.upArrow) {
            setCursor((c) => Math.max(0, c - 1));
            return;
        }
        if (key.downArrow) {
            setCursor((c) => Math.min(options.length - 1, c + 1));
            return;
        }
        if (key.return) {
            const pick = options[cursor];
            if (pick !== undefined)
                onPick(pick.value);
            return;
        }
        if (key.backspace || key.delete) {
            onCancel();
            return;
        }
        if (!key.ctrl && !key.meta && /^[1-9]$/u.test(input)) {
            const idx = Number(input) - 1;
            const pick = options[idx];
            if (pick !== undefined)
                onPick(pick.value);
        }
    });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, paddingX: 1, marginTop: 1, children: [_jsx(Box, { paddingX: 1, children: _jsx(Text, { children: palette.accent(title) }) }), _jsxs(Box, { flexDirection: "column", paddingX: 1, children: [hiddenAbove > 0 ? (_jsx(Text, { dimColor: true, children: `  ↑ 还有 ${hiddenAbove} 项` })) : null, visible.map((opt, offset) => {
                        const idx = start + offset;
                        const selected = idx === cursor;
                        const marker = selected ? palette.accent('▸ ') : '  ';
                        const num = palette.muted(`${idx + 1} `);
                        const label = selected ? palette.accent(opt.label) : palette.bold(opt.label);
                        const hintBudget = Math.max(8, columns - displayWidth(opt.label) - 14);
                        const hint = clipColumns(opt.hint, hintBudget);
                        const hintStyled = selected ? hint : palette.dim(hint);
                        return (_jsxs(Text, { children: [_jsx(Text, { children: marker }), _jsx(Text, { children: num }), _jsxs(Text, { children: [label, " \u2014 "] }), _jsx(Text, { children: hintStyled })] }, opt.value));
                    }), hiddenBelow > 0 ? (_jsx(Text, { dimColor: true, children: `  ↓ 还有 ${hiddenBelow} 项` })) : null] }), _jsx(Box, { paddingX: 1, children: _jsx(Text, { dimColor: true, children: "\u2191/\u2193 \u6216\u6570\u5B57\u952E\u9009\u62E9 \u00B7 Enter \u751F\u6548 \u00B7 Esc \u53D6\u6D88" }) })] }));
}
/**
 * Patch session titles into a picker's rows: `resume <id>` rows get the loaded
 * title, every other row is left alone. Titles load after the menu is drawn
 * (they read each session log), so this runs as a second pass.
 */
export function withSessionTitles(options, titles) {
    return options.map((option) => {
        const id = /^resume (\S+)$/u.exec(option.value)?.[1];
        const title = id !== undefined ? titles.get(id) : undefined;
        return title === undefined || title === '' ? option : { ...option, hint: title };
    });
}
//# sourceMappingURL=OptionMenu.js.map