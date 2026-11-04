import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Autocomplete — a small popover that lists fuzzy-matched candidates when the
 * user types `@` or `/`. Used by both reference lookups (skills, MCP tools,
 * saved prompts) and slash-command discovery.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Autocomplete
 */
import { Box, Text, useStdout } from 'ink';
import { displayWidth } from "../markdown/render.js";
import Fuse from 'fuse.js';
import { palette } from "../theme/palette.js";
/** Render the autocomplete popover. */
/** Clip a string to `width` display columns (CJK-aware), appending an
 *  ellipsis when cut. Long hints otherwise WRAP inside the box and break
 *  the one-row-per-item alignment — the "messy menu" report. */
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
export function Autocomplete({ trigger, query, candidates, selected, maxVisible = 6 }) {
    const { stdout } = useStdout();
    const columns = stdout?.columns ?? 100;
    const fuse = new Fuse(candidates, {
        keys: ['label', 'hint', 'keywords'],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 1,
    });
    // Name-first matching (menu review fix): command-NAME hits always rank
    // before description hits — typing "engine" must not bury /engine under
    // /tools ("Tool engine…") whose DESCRIPTION contains the word.
    const q = query.toLowerCase();
    const byName = candidates.filter((c) => c.label.toLowerCase().includes(q));
    const filtered = query === ''
        ? candidates.slice(0, maxVisible)
        : [...new Set([
                ...byName,
                ...fuse.search(query).map((r) => r.item),
            ])].slice(0, maxVisible);
    if (filtered.length === 0) {
        return (_jsx(Box, { flexDirection: "column", paddingX: 1, marginTop: 0, children: _jsx(Text, { dimColor: true, children: palette.muted(`no ${trigger === '/' ? 'commands' : 'references'} match "${query}"`) }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginTop: 0, borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, children: [_jsx(Text, { children: palette.muted(` ${trigger} ${query === '' ? '' : query}_ `) }), _jsx(Box, { flexDirection: "column", paddingX: 1, children: filtered.map((item, idx) => {
                    const isSelected = idx === selected;
                    const cursor = isSelected ? palette.accent('▸ ') : '  ';
                    const label = isSelected ? palette.accent(item.label) : item.label;
                    // One row per item: clip the hint so it can never wrap. Budget:
                    // border(2) + outer/inner padding(4) + marker(2) + label + gap(2).
                    const hintBudget = Math.max(8, columns - displayWidth(item.label) - 12);
                    const hint = item.hint !== undefined ? palette.muted(`  ${clipColumns(item.hint, hintBudget)}`) : '';
                    return (_jsxs(Text, { children: [_jsx(Text, { children: cursor }), _jsx(Text, { children: label }), _jsx(Text, { children: hint })] }, `${trigger}-${item.insert}`));
                }) })] }));
}
/** Built-in slash-command candidate list (all 25 shipped commands). */
export function slashCandidates(items) {
    return items.map((item) => ({
        insert: item.name,
        label: `/${item.name}`,
        hint: item.description,
    }));
}
//# sourceMappingURL=Autocomplete.js.map