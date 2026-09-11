import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Autocomplete — a small popover that lists fuzzy-matched candidates when the
 * user types `@` or `/`. Used by both reference lookups (skills, MCP tools,
 * saved prompts) and slash-command discovery.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Autocomplete
 */
import { Box, Text } from 'ink';
import Fuse from 'fuse.js';
import { palette } from '../theme/palette.js';
/** Render the autocomplete popover. */
export function Autocomplete({ trigger, query, candidates, selected, maxVisible = 6 }) {
    const fuse = new Fuse(candidates, {
        keys: ['label', 'hint', 'keywords'],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 1,
    });
    const filtered = query === '' ? candidates.slice(0, maxVisible) : fuse.search(query).map((r) => r.item).slice(0, maxVisible);
    if (filtered.length === 0) {
        return (_jsx(Box, { flexDirection: "column", paddingX: 1, marginTop: 0, children: _jsx(Text, { dimColor: true, children: palette.muted(`no ${trigger === '/' ? 'commands' : 'references'} match "${query}"`) }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginTop: 0, borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, children: [_jsx(Text, { children: palette.muted(` ${trigger} ${query === '' ? '' : query}_ `) }), _jsx(Box, { flexDirection: "column", paddingX: 1, children: filtered.map((item, idx) => {
                    const isSelected = idx === selected;
                    const cursor = isSelected ? palette.accent('▸ ') : '  ';
                    const label = isSelected ? palette.accent(item.label) : item.label;
                    const hint = item.hint !== undefined ? palette.muted(`  ${item.hint}`) : '';
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