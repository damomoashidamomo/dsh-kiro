/**
 * ProgressOverlay — a one-line spinner + status string rendered above the
 * StatusBar whenever the agent is running a tool or a turn. Disappears
 * automatically when `state.agent.status` returns to `idle`.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/ProgressOverlay
 */

import { Box, Text } from 'ink'
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
  // STATIC indicator — an animated spinner re-renders the whole live
  // region ~10-20x/s and makes the terminal visibly shake while streaming.
  const label = toolName !== undefined ? palette.accent(`running ${toolName}`) : palette.warning('thinking…')
  const right = subtext !== undefined ? palette.muted(subtext) : ''
  return (
    <Box flexDirection="row" paddingX={1} marginTop={0}>
      <Text>{palette.accentSoft('◆')}</Text>
      <Text> {label}</Text>
      {right !== '' ? <Text>  {right}</Text> : null}
    </Box>
  )
}
