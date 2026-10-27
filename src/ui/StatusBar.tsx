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
        {agent.planMode ? (
          <>
            <Text> {palette.muted('·')} </Text>
            <Text>{palette.warning('[plan]')}</Text>
          </>
        ) : null}
        {presetChip(agent.permissionPreset) !== null ? (
          <>
            <Text> {palette.muted('·')} </Text>
            <Text>{presetChip(agent.permissionPreset)}</Text>
          </>
        ) : null}
        {agent.lastTtftMs !== undefined ? (
          <>
            <Text> {palette.muted('·')} </Text>
            <Text>{palette.muted(`首字 ${(agent.lastTtftMs / 1000).toFixed(1)}s`)}</Text>
          </>
        ) : null}
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

/** Short kiro-style spelling for a permission preset chip. */
function presetChip(preset: string | undefined): string | null {
  if (preset === undefined) return null
  const short: Record<string, string> = {
    'read-only': '[read-only]',
    'workspace-write': '[write]',
    'danger-full-access': '[full]',
    custom: '[custom]',
  }
  return short[preset] ?? `[${preset}]`
}

