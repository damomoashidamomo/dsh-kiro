import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * StatusBar — the bottom-of-screen line showing agent name, model, status,
 * token usage, and the active slash prefix. Always present; renders below
 * the Prompt component.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/StatusBar
 */
import { Box, Text } from 'ink';
import { homedir } from 'node:os';
import { palette } from "../theme/palette.js";
const STATUS_LABEL = {
    idle: 'idle',
    running: 'running',
    cancelling: 'cancelling',
    error: 'error',
};
/**
 * Stable identity of the session, as plain text: agent, workspace, model and
 * the kiro engine combo. The boot line prints this ONCE into the transcript
 * (kiro-cli prints `Model: auto (/model to change)` the same way), and the
 * live bar is compared against it — an unchanged identity needs no bar.
 */
export function identityText(agent, activeAgentName) {
    const parts = [`[${activeAgentName ?? 'default'}]`];
    if (agent.workspace !== undefined)
        parts.push(`工作区: ${abbreviateHome(agent.workspace)}`);
    parts.push(agent.activeProvider !== undefined && agent.activeModel !== undefined
        ? `${agent.activeProvider}/${agent.activeModel}`
        : 'model: pending');
    if (agent.loopDriver === 'kiro')
        parts.push(`[kiro${agent.toolEngine === 'rust' ? '/rust' : ''}]`);
    if (agent.planMode === true)
        parts.push('[plan]');
    return parts.join(' · ');
}
/**
 * Whether the live status bar is worth a row.
 *
 * kiro-cli has NO persistent bar: its context usage rides the prompt gutter
 * and the model is announced once at boot, so an echoed prompt line sits
 * directly above the prompt. The bar here is therefore transient — it appears
 * only when it has news: the identity changed since boot, a prefix is active,
 * or a decision (approval / question) is waiting.
 */
export function shouldShowStatusBar(input) {
    if (input.prefix !== undefined)
        return true;
    if (input.awaitingDecision === true)
        return true;
    const identity = identityText(input.agent, input.activeAgentName);
    if (input.bootIdentity === undefined)
        return true;
    return identity !== input.bootIdentity;
}
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
    return (_jsx(Box, { flexDirection: "row", paddingX: 1, marginTop: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: palette.enabled ? 'green' : undefined, children: palette.agent(`[${agentLabel}]`) }), agent.workspace !== undefined ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.accent2(`工作区: ${abbreviateHome(agent.workspace)}`) })] })) : null, _jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.accent(modelLabel) }), _jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: statusColor(STATUS_LABEL[agent.status]) }), agent.loopDriver === 'kiro' ? (_jsxs(Text, { children: [' ', palette.accent(`[kiro${agent.toolEngine === 'rust' ? '/rust' : ''}]`)] })) : null, agent.planMode ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.warning('[plan]') })] })) : null, agent.lastTtftMs !== undefined ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.muted(`首字 ${(agent.lastTtftMs / 1000).toFixed(1)}s`) })] })) : null, prefixLabel !== '' ? _jsxs(Text, { children: [" ", prefixLabel] }) : null, agent.lastTurnReason !== undefined ? (_jsxs(_Fragment, { children: [_jsxs(Text, { children: [" ", palette.muted('·'), " "] }), _jsx(Text, { children: palette.muted(`last: ${agent.lastTurnReason}`) })] })) : null] }) }));
}
/** Home-abbreviated path: /home/gary/x -> ~/x (compact status bar form). */
function abbreviateHome(path) {
    const home = homedir();
    return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
//# sourceMappingURL=StatusBar.js.map