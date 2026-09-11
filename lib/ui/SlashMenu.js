import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * SlashMenu — Ctrl+K overlay that fuzzy-searches the entire slash-command
 * registry. Renders groups of commands; arrow-key navigation picks one and
 * Enter dispatches it as if the user had typed it.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/SlashMenu
 */
import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { palette } from '../theme/palette.js';
import { groupCommands } from '../commands/registry.js';
/** Render the slash-command palette. */
export function SlashMenu({ initialQuery, active, onClose, onSelect }) {
    const groups = useMemo(() => groupCommands(), []);
    const flat = useMemo(() => groups.flatMap((g) => g.items.map((c) => ({ ...c, group: g.title }))), [groups]);
    const fuse = useMemo(() => new Fuse(flat, {
        keys: ['name', 'description'],
        threshold: 0.35,
        ignoreLocation: true,
    }), [flat]);
    const [query, setQuery] = useState(initialQuery.replace(/^\//, ''));
    const [cursor, setCursor] = useState(0);
    const visible = query === ''
        ? flat.slice(0, 30)
        : fuse.search(query).map((r) => r.item).slice(0, 30);
    useInput((input, key) => {
        if (!active)
            return;
        if (key.escape) {
            onClose();
            return;
        }
        if (key.return) {
            const target = visible[cursor] ?? visible[0];
            if (target !== undefined) {
                onSelect(`/${target.name} `);
            }
            onClose();
            return;
        }
        if (key.downArrow) {
            setCursor((c) => Math.min(visible.length - 1, c + 1));
            return;
        }
        if (key.upArrow) {
            setCursor((c) => Math.max(0, c - 1));
            return;
        }
        if (key.backspace) {
            setQuery((q) => q.slice(0, -1));
            setCursor(0);
            return;
        }
        if (input.length > 0 && !key.ctrl && !key.meta) {
            setQuery((q) => q + input);
            setCursor(0);
        }
    });
    if (!active)
        return null;
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginTop: 0, borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, children: [_jsxs(Box, { flexDirection: "row", paddingX: 1, children: [_jsxs(Text, { children: [palette.accent('/'), " "] }), _jsx(Text, { children: palette.accent(query === '' ? '_' : `${query}_`) })] }), _jsxs(Box, { flexDirection: "column", paddingX: 1, children: [visible.map((cmd, idx) => {
                        const isSelected = idx === cursor;
                        const marker = isSelected ? palette.accent('▸ ') : '  ';
                        const label = isSelected ? palette.accent(`/${cmd.name}`) : `/${cmd.name}`;
                        const group = palette.muted(` [${cmd.group}]`);
                        const desc = palette.dim(`  ${cmd.description}`);
                        return (_jsxs(Text, { children: [_jsx(Text, { children: marker }), _jsx(Text, { children: label.padEnd(18) }), _jsx(Text, { children: group }), _jsx(Text, { children: desc })] }, cmd.name));
                    }), visible.length === 0 ? (_jsx(Text, { dimColor: true, children: palette.muted(`no commands match "${query}"`) })) : null] }), _jsx(Box, { paddingX: 1, children: _jsx(Text, { dimColor: true, children: "\u2191/\u2193 navigate \u00B7 Enter select \u00B7 Esc close" }) })] }));
}
//# sourceMappingURL=SlashMenu.js.map