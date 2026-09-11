/**
 * StatusBar — the bottom-of-screen line showing agent name, model, status,
 * token usage, and the active slash prefix. Always present; renders below
 * the Prompt component.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/StatusBar
 */

import { Box, Text } from 'ink'
import { palette } from '../theme/palette'
import type { AgentStatusSnapshot } from '../runtime/types'

export interface StatusBarProps {
  agent: AgentStatusSnapshot
  /** Active prefix in the prompt — `'/' | '@' | '!' | undefined`. */
  prefix?: '/' | '@' | '!' | undefined
  /** Current agent label (e.g. `'backend-specialist'`). */
  activeAgentName?: string | undefined
}

const STATUS_LABEL: Record<AgentStatusSnapshot['status'], string> = {
  idle: 'idle',
  running: 'running',
  cancelling: 'cancelling',
  error: 'error',
}

/** Render the StatusBar. */
export function StatusBar({ agent, prefix, activeAgentName }: StatusBarProps): JSX.Element {
  const statusColor = agent.status === 'running'
    ? palette.warning
    : agent.status === 'error'
      ? palette.error
      : palette.success
  const usageBar = renderUsageBar(agent.contextUsedTokens, agent.contextLimitTokens)
  const agentLabel = activeAgentName ?? 'default'
  const modelLabel = agent.activeProvider !== undefined && agent.activeModel !== undefined
    ? `${agent.activeProvider}/${agent.activeModel}`
    : 'model: pending'
  const prefixLabel = prefix === '/'
    ? palette.accent(' /commands')
    : prefix === '@'
      ? palette.accent2(' @tools')
      : prefix === '!'
        ? palette.warning(' !shell')
        : ''

  return (
    <Box flexDirection="row" paddingX={1} marginTop={1}>
      <Text>
        <Text color={palette.enabled ? 'green' : undefined}>{palette.agent(`[${agentLabel}]`)}</Text>
        <Text> {palette.muted('·')} </Text>
        <Text>{palette.accent(modelLabel)}</Text>
        <Text> {palette.muted('·')} </Text>
        <Text>{statusColor(STATUS_LABEL[agent.status])}</Text>
        <Text> {palette.muted('·')} </Text>
        <Text>{usageBar}</Text>
        {prefixLabel !== '' ? <Text> {prefixLabel}</Text> : null}
        {agent.lastTurnReason !== undefined ? (
          <>
            <Text> {palette.muted('·')} </Text>
            <Text>{palette.muted(`last: ${agent.lastTurnReason}`)}</Text>
          </>
        ) : null}
      </Text>
    </Box>
  )
}

/** Render a token-usage bar with a fraction (used / limit). */
function renderUsageBar(used: number, limit: number | undefined): string {
  if (limit === undefined) {
    return palette.muted(`${formatNumber(used)} tokens`)
  }
  const ratio = Math.min(1, used / limit)
  const width = 16
  const filled = Math.round(ratio * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  const pct = `${Math.round(ratio * 100)}%`
  return `${palette.usage(bar)} ${palette.muted(`${formatNumber(used)}/${formatNumber(limit)} (${pct})`)}`
}

function formatNumber(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1000000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1000000).toFixed(1)}M`
}
