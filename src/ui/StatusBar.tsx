/**
 * StatusBar — the bottom-of-screen line showing agent name, model, status,
 * token usage, and the active slash prefix. Always present; renders below
 * the Prompt component.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/StatusBar
 */

import { Box, Text } from 'ink'
import { homedir } from 'node:os'
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

/**
 * Stable identity of the session, as plain text: agent, workspace, model and
 * the kiro engine combo. The boot line prints this ONCE into the transcript
 * (kiro-cli prints `Model: auto (/model to change)` the same way), and the
 * live bar is compared against it — an unchanged identity needs no bar.
 */
export function identityText(agent: AgentStatusSnapshot, activeAgentName?: string | undefined): string {
  const parts = [`[${activeAgentName ?? 'default'}]`]
  if (agent.workspace !== undefined) parts.push(`工作区: ${abbreviateHome(agent.workspace)}`)
  parts.push(agent.activeProvider !== undefined && agent.activeModel !== undefined
    ? `${agent.activeProvider}/${agent.activeModel}`
    : 'model: pending')
  if (agent.loopDriver === 'kiro') parts.push(`[kiro${agent.toolEngine === 'rust' ? '/rust' : ''}]`)
  if (agent.planMode === true) parts.push('[plan]')
  return parts.join(' · ')
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
export function shouldShowStatusBar(input: {
  readonly agent: AgentStatusSnapshot
  readonly activeAgentName?: string | undefined
  readonly prefix?: '/' | '@' | '!' | undefined
  readonly bootIdentity?: string | undefined
  readonly awaitingDecision?: boolean
}): boolean {
  if (input.prefix !== undefined) return true
  if (input.awaitingDecision === true) return true
  const identity = identityText(input.agent, input.activeAgentName)
  if (input.bootIdentity === undefined) return true
  return identity !== input.bootIdentity
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
        {agent.workspace !== undefined ? (
          <>
            <Text> {palette.muted('·')} </Text>
            <Text>{palette.accent2(`工作区: ${abbreviateHome(agent.workspace)}`)}</Text>
          </>
        ) : null}
        <Text> {palette.muted('·')} </Text>
        <Text>{palette.accent(modelLabel)}</Text>
        <Text> {palette.muted('·')} </Text>
        <Text>{statusColor(STATUS_LABEL[agent.status])}</Text>
        {agent.loopDriver === 'kiro' ? (
          <Text>
            {' '}
            {palette.accent(`[kiro${agent.toolEngine === 'rust' ? '/rust' : ''}]`)}
          </Text>
        ) : null}
        {agent.planMode ? (
          <>
            <Text> {palette.muted('·')} </Text>
            <Text>{palette.warning('[plan]')}</Text>
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

/** Home-abbreviated path: /home/gary/x -> ~/x (compact status bar form). */
function abbreviateHome(path: string): string {
  const home = homedir()
  return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

