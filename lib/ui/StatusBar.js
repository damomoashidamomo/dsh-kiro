import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * StatusBar — the bottom-of-screen line showing agent name, model, status,
 * token usage, and the active slash prefix. Always present; renders below
 * the Prompt component.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/StatusBar
 */
import { Box, Text } from 'ink';
import { palette } from '../theme/palette.js';
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
    const usageBar = renderUsageBar(agent.contextUsedTokens, agent.contextLimitTokens);
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
    return (_jsx(Box, { flexDirection: "row", paddingX: 1, marginTop: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: palette.agent(`[${agentLabel}]`) }), _jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.accent(modelLabel) }), _jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: statusColor(STATUS_LABEL[agent.status]) }), _jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: usageBar }), prefixLabel !== '' ? _jsxs(Text, { children: [" ", prefixLabel] }) : null, agent.lastTurnReason !== undefined ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.muted(`last: ${agent.lastTurnReason}`) })] })) : null] }) }));
}
/** Render a token-usage bar with a fraction (used / limit). */
function renderUsageBar(used, limit) {
    if (limit === undefined) {
        return palette.muted(`${formatNumber(used)} tokens`);
    }
    const ratio = Math.min(1, used / limit);
    const width = 16;
    const filled = Math.round(ratio * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const pct = `${Math.round(ratio * 100)}%`;
    return `${palette.usage(bar)} ${palette.muted(`${formatNumber(used)}/${formatNumber(limit)} (${pct})`)}`;
}
function formatNumber(value) {
    if (value < 1000)
        return String(value);
    if (value < 1000000)
        return `${(value / 1000).toFixed(1)}k`;
    return `${(value / 1000000).toFixed(1)}M`;
}
//# sourceMappingURL=StatusBar.js.map