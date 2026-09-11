import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * App — the Ink root component. Lays out the Transcript, optional Splash,
 * StatusBar, and Prompt, and dispatches key actions to the runtime.
 *
 * The component is dumb on purpose: all state lives on the
 * SessionController, and React only re-renders when the controller publishes.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */
import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import { Transcript } from './Transcript.js';
import { Prompt } from './Prompt.js';
import { StatusBar } from './StatusBar.js';
import { banner, palette } from '../theme/palette.js';
import { BANNER } from '../theme/banner.js';
import { mapKey } from '../runtime/keybindings.js';
/** Render the TUI. */
export function App({ controller, seedTask, activeAgentName, onSubmit }) {
    const { exit } = useApp();
    const [state, setState] = useState(() => controller.getState());
    const [prefix, setPrefix] = useState(undefined);
    const [seeded, setSeeded] = useState(seedTask === undefined);
    useEffect(() => controller.subscribe(setState), [controller]);
    useEffect(() => {
        if (seeded)
            return;
        if (seedTask !== undefined && seedTask !== '') {
            onSubmit(seedTask);
        }
        setSeeded(true);
    }, [seeded, seedTask, onSubmit]);
    // Top-level keybindings dispatch on top of the Prompt's own useInput.
    // Ink routes key events to all `useInput` subscribers in registration order,
    // so we set this one first and let the Prompt handle its own characters.
    useInput((input, key) => {
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
    }, { isActive: true });
    const splash = useMemo(() => banner(BANNER), []);
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsx(Box, { flexDirection: "column", paddingX: 1, marginTop: 1, children: _jsx(Text, { children: splash }) }), _jsx(Transcript, { messages: state.messages }), _jsx(StatusBar, { agent: state.agent, prefix: prefix, activeAgentName: activeAgentName }), _jsx(Prompt, { busy: state.agent.status === 'running', onSubmit: (text) => {
                    onSubmit(text);
                    setPrefix(undefined);
                }, onPrefix: setPrefix }), state.overlay.kind !== 'none' ? (_jsx(Box, { borderStyle: "round", borderColor: palette.enabled ? 'green' : undefined, paddingX: 1, marginTop: 1, children: _jsx(Text, { children: palette.accent(`overlay: ${state.overlay.kind}`) }) })) : null] }));
}
//# sourceMappingURL=App.js.map