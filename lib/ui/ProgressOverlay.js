import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ProgressOverlay — a one-line spinner + status string rendered above the
 * StatusBar whenever the agent is running a tool or a turn. Disappears
 * automatically when `state.agent.status` returns to `idle`.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/ProgressOverlay
 */
import { Box, Text } from 'ink';
import { palette } from "../theme/palette.js";
/** Render a transient progress bar with a spinner. */
export function ProgressOverlay({ toolName, busy, subtext }) {
    if (!busy && toolName === undefined)
        return null;
    // STATIC indicator — an animated spinner re-renders the whole live
    // region ~10-20x/s and makes the terminal visibly shake while streaming.
    const label = toolName !== undefined ? palette.accent(`running ${toolName}`) : palette.warning('thinking…');
    const right = subtext !== undefined ? palette.muted(subtext) : '';
    return (_jsxs(Box, { flexDirection: "row", paddingX: 1, marginTop: 0, children: [_jsx(Text, { children: palette.accentSoft('◆') }), _jsxs(Text, { children: [" ", label] }), right !== '' ? _jsxs(Text, { children: ["  ", right] }) : null] }));
}
//# sourceMappingURL=ProgressOverlay.js.map