import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * App — the Ink root component. Lays out the Transcript, Splash, StatusBar,
 * Prompt, and the optional ProgressOverlay / SlashMenu.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */
import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { Transcript } from './Transcript.js';
import { Prompt } from './Prompt.js';
import { StatusBar } from './StatusBar.js';
import { ProgressOverlay } from './ProgressOverlay.js';
import { SlashMenu } from './SlashMenu.js';
import { Autocomplete, slashCandidates } from './Autocomplete.js';
import { banner, palette } from '../theme/palette.js';
import { BANNER } from '../theme/banner.js';
import { mapKey } from '../runtime/keybindings.js';
import { ALL_COMMANDS } from '../commands/registry.js';
/** Render the TUI. */
export function App({ controller, seedTask, activeAgentName, onSubmit }) {
    const { exit } = useApp();
    const [state, setState] = useState(() => controller.getState());
    const [prefix, setPrefix] = useState(undefined);
    const [seeded, setSeeded] = useState(seedTask === undefined);
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [prefixQuery, setPrefixQuery] = useState('');
    const [autocompleteSelected, setAutocompleteSelected] = useState(0);
    useEffect(() => controller.subscribe(setState), [controller]);
    useEffect(() => {
        if (seeded)
            return;
        if (seedTask !== undefined && seedTask !== '') {
            onSubmit(seedTask);
        }
        setSeeded(true);
    }, [seeded, seedTask, onSubmit]);
    // Top-level keybindings dispatch on top of the Prompt's own useInput. Ink
    // routes key events to all `useInput` subscribers in registration order.
    useInput((input, key) => {
        if (slashMenuOpen)
            return;
        if (state.overlay.kind !== 'none')
            return;
        const action = mapKey({ input, key });
        if (action === 'quit') {
            exit();
        }
        else if (action === 'interrupt') {
            controller.patchAgent({ status: 'cancelling' });
        }
        else if (action === 'clear-screen') {
            process.stdout.write('\x1b[2J\x1b[H');
        }
        else if (action === 'open-slash-menu') {
            setSlashMenuOpen(true);
        }
    }, { isActive: true });
    const splash = useMemo(() => banner(BANNER), []);
    const activeToolName = useMemo(() => {
        for (let i = state.messages.length - 1; i >= 0; i -= 1) {
            const msg = state.messages[i];
            if (msg?.kind === 'tool-call' && msg.streaming && msg.tool !== undefined) {
                return msg.tool.name;
            }
        }
        return undefined;
    }, [state.messages]);
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsx(Box, { flexDirection: "column", paddingX: 1, marginTop: 1, children: _jsx(Text, { children: splash }) }), _jsx(Transcript, { messages: state.messages }), _jsx(ProgressOverlay, { toolName: activeToolName, busy: state.agent.status === 'running', subtext: state.hasActiveTool ? 'executing…' : undefined }), _jsx(StatusBar, { agent: state.agent, prefix: prefix, activeAgentName: activeAgentName }), slashMenuOpen ? (_jsx(SlashMenu, { initialQuery: prefix === '/' ? prefixQuery : '', active: slashMenuOpen, onClose: () => setSlashMenuOpen(false), onSelect: (text) => onSubmit(text) })) : (_jsx(Prompt, { busy: state.agent.status === 'running', onSubmit: (text) => {
                    onSubmit(text);
                    setPrefix(undefined);
                    setPrefixQuery('');
                    setAutocompleteSelected(0);
                }, onPrefix: (p, query) => {
                    setPrefix(p);
                    setPrefixQuery(query ?? '');
                    setAutocompleteSelected(0);
                }, onAutocompleteMove: (delta) => {
                    setAutocompleteSelected((idx) => Math.max(0, idx + delta));
                }, onAutocompleteCommit: () => {
                    const items = slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description })));
                    const filtered = items.filter((it) => prefix === '/' || prefix === '@');
                    const visible = filtered.slice(autocompleteSelected, autocompleteSelected + 1);
                    if (visible[0] !== undefined) {
                        onSubmit(visible[0].insert);
                    }
                    setPrefix(undefined);
                    setPrefixQuery('');
                } })), prefix === '/' && !slashMenuOpen ? (_jsx(Autocomplete, { trigger: "/", query: prefixQuery, candidates: slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description }))), selected: autocompleteSelected })) : prefix === '@' && !slashMenuOpen ? (_jsx(Autocomplete, { trigger: "@", query: prefixQuery, candidates: [], selected: 0 })) : null, state.overlay.kind !== 'none' ? (_jsx(Box, { borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, paddingX: 1, marginTop: 1, children: _jsx(Text, { children: palette.accent(`overlay: ${state.overlay.kind}`) }) })) : null] }));
}
//# sourceMappingURL=App.js.map