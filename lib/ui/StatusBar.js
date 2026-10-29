import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * StatusBar — the bottom-of-screen line showing agent name, model, status,
 * token usage, and the active slash prefix. Always present; renders below
 * the Prompt component.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/StatusBar
 */
import { Box, Text } from 'ink';
import { basename } from 'node:path';
import { palette } from "../theme/palette.js";
const STATUS_LABEL = {
    idle: 'idle',
    running: 'running',
    cancelling: 'cancelling',
    error: 'error',
};
/** Render the StatusBar. */
export function StatusBar({ agent, prefix, activeAgentName }) {
    const statusColor = agent.status === 'running'
        ? palette.warning
        : agent.status === 'error'
            ? palette.error
            : palette.success;
    const agentLabel = activeAgentName ?? 'default';
    const modelLabel = agent.activeProvider !== undefined && agent.activeModel !== undefined
        ? `${agent.activeProvider}/${agent.activeModel}`
        : 'model: pending';
    const prefixLabel = prefix === '/'
        ? palette.accent(' /commands')
        : prefix === '@'
            ? palette.accent2(' @tools')
            : prefix === '!'
                ? palette.warning(' !shell')
                : '';
    return (_jsx(Box, { flexDirection: "row", paddingX: 1, marginTop: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: palette.agent(`[${agentLabel}]`) }), agent.workspace !== undefined ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.accent2(`📁 ${basename(agent.workspace)}`) })] })) : null, _jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.accent(modelLabel) }), _jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: statusColor(STATUS_LABEL[agent.status]) }), agent.planMode ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.warning('[plan]') })] })) : null, presetChip(agent.permissionPreset) !== null ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: presetChip(agent.permissionPreset) })] })) : null, agent.lastTtftMs !== undefined ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.muted(`首字 ${(agent.lastTtftMs / 1000).toFixed(1)}s`) })] })) : null, prefixLabel !== '' ? _jsxs(Text, { children: [" ", prefixLabel] }) : null, agent.lastTurnReason !== undefined ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.muted(`last: ${agent.lastTurnReason}`) })] })) : null] }) }));
}
/** Short kiro-style spelling for a permission preset chip. */
function presetChip(preset) {
    if (preset === undefined)
        return null;
    const short = {
        'read-only': '[只读]',
        'workspace-write': '[工作区]',
        'danger-full-access': '[完全]',
        custom: '[自定义]',
    };
    return short[preset] ?? `[${preset}]`;
}
//# sourceMappingURL=StatusBar.js.map