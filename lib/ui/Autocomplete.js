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
/**
 * Rank candidates for the popup AND for the Enter key.
 *
 * Enter used to commit through a DIFFERENT filter than the one on screen, and
 * neither ranked an exact name first — typing `/mode` + Enter ran `/model`
 * ("mode" is a prefix of "model" and /model ships first in the registry), so
 * the highlighted row and the executed command could disagree.
 *
 * Tiers: exact name, name prefix, name substring, hint substring, then fuzzy.
 */
export function rankCandidates(items, query, limit, fuzzy) {
    const q = query.trim().toLowerCase();
    const order = new Map(items.map((item, index) => [item, index]));
    const tie = (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
    if (q === '')
        return limit === undefined ? [...items] : items.slice(0, limit);
    const tier = (item) => {
        const label = item.label.toLowerCase().replace(/^[/@]/u, '');
        if (label === q)
            return 0;
        if (label.startsWith(q))
            return 1;
        if (label.includes(q))
            return 2;
        if ((item.hint ?? '').toLowerCase().includes(q))
            return 3;
        return 9;
    };
    const ranked = items
        .map((item) => ({ item, score: tier(item) }))
        .filter((row) => row.score < 9)
        .sort((a, b) => a.score - b.score || tie(a.item, b.item))
        .map((row) => row.item);
    if (fuzzy !== undefined) {
        for (const hit of fuzzy.search(query)) {
            if (!ranked.includes(hit.item))
                ranked.push(hit.item);
        }
    }
    return limit === undefined ? ranked : ranked.slice(0, limit);
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
    const filtered = rankCandidates(candidates, query, maxVisible, fuse);
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