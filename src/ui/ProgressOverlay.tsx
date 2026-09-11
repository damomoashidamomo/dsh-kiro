/**
 * ProgressOverlay — a one-line spinner + status string rendered above the
 * StatusBar whenever the agent is running a tool or a turn. Disappears
 * automatically when `state.agent.status` returns to `idle`.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/ProgressOverlay
 */

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { palette } from '../theme/palette'

export interface ProgressOverlayProps {
  /** Tool name being executed, if any. */
  readonly toolName: string | undefined
  /** Whether the agent is currently in a turn. */
  readonly busy: boolean
  /** Optional sub-status text (e.g. token-count summary). */
  readonly subtext: string | undefined
}

/** Render a transient progress bar with a spinner. */
export function ProgressOverlay({ toolName, busy, subtext }: ProgressOverlayProps): JSX.Element | null {
  if (!busy && toolName === undefined) return null
  const label = toolName !== undefined ? palette.accent(`running ${toolName}`) : palette.warning('thinking')
  const right = subtext !== undefined ? palette.muted(subtext) : ''
  return (
    <Box flexDirection="row" paddingX={1} marginTop={0}>
      <Text color={palette.enabled ? 'green' : undefined}>
        <Spinner type="dots" />
      </Text>
      <Text> {label}</Text>
      {right !== '' ? <Text>  {right}</Text> : null}
    </Box>
  )
}
