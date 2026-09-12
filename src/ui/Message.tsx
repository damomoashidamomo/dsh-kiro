/**
 * @deepseek-ai/ui-primitives/markdown render — minimal but faithful GFM subset
 * for the dsh-kiro TUI. Renders to ANSI strings the Ink renderer consumes.
 *
 * Mirrors the Web markdown layer's vocabulary (mdast) on a stripped surface:
 * inline emphasis, strong, code, links, line breaks, headings (h1–h6),
 * fenced code blocks with syntax highlighting, block quotes, ordered and
 * unordered lists, GFM tables (box-drawing), and horizontal rules.
 */

import { Box, Text } from 'ink'
import { renderMarkdown } from '../markdown/render'
import { palette, ICONS } from '../theme/palette'
import type { Message as MessageRecord } from '../runtime/types'

export interface MessageProps {
  message: MessageRecord
}

/** Render one message — the unit of transcript rendering. */
export function Message({ message }: MessageProps): JSX.Element {
  switch (message.kind) {
    case 'user':
      return <UserMessage text={message.text} />
    case 'assistant':
      return <AssistantMessage text={message.text} streaming={message.streaming} />
    case 'reasoning':
      return <ReasoningMessage text={message.text} />
    case 'tool-call':
      return <ToolMessage message={message} />
    case 'system':
      return <SystemMessage text={message.text} />
    case 'error':
      return <ErrorMessage text={message.text} />
    default:
      return <SystemMessage text="(unknown message kind)" />
  }
}

/** Render a user prompt with the `›` gutter. */
function UserMessage({ text }: { text: string }): JSX.Element {
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text>{palette.accent(`${ICONS.user} `)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text>{text}</Text>
      </Box>
    </Box>
  )
}

/** Render an assistant message with markdown and streaming cursor. */
function AssistantMessage({ text, streaming }: { text: string; streaming: boolean }): JSX.Element {
  const rendered = renderMarkdown(text)
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text>{palette.accent2(`${ICONS.assistant} `)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text>
          {rendered}
          {streaming ? palette.accent(' ▍') : null}
        </Text>
      </Box>
    </Box>
  )
}

/** Render a reasoning block in italic muted-green. */
function ReasoningMessage({ text }: { text: string }): JSX.Element {
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text>{palette.accentSoft(`${ICONS.reasoning} `)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text>{palette.reasoning(text)}</Text>
      </Box>
    </Box>
  )
}

/** Render a system message in muted dim. */
function SystemMessage({ text }: { text: string }): JSX.Element {
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text>{palette.muted(`${ICONS.system} `)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text>{palette.muted(text)}</Text>
      </Box>
    </Box>
  )
}

/** Render an error message in red. */
function ErrorMessage({ text }: { text: string }): JSX.Element {
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text>{palette.error(`${ICONS.error} `)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text>{palette.error(text)}</Text>
      </Box>
    </Box>
  )
}

/** Render a tool call + (eventually) result. */
function ToolMessage({ message }: { message: MessageRecord }): JSX.Element {
  const tool = message.tool
  if (tool === undefined) {
    return <SystemMessage text="(orphan tool event)" />
  }
  const stateLabel: Record<typeof tool.state, string> = {
    pending: palette.muted('pending'),
    running: palette.warning(`running ${palette.muted('...')}`),
    done: palette.success('done'),
    failed: palette.error('failed'),
    cancelled: palette.muted('cancelled'),
  }
  const icon = tool.state === 'done'
    ? ICONS.toolDone
    : tool.state === 'failed'
      ? ICONS.toolFailed
      : ICONS.tool
  const iconColor = tool.state === 'done'
    ? palette.success
    : tool.state === 'failed'
      ? palette.error
      : tool.state === 'running'
        ? palette.warning
        : palette.muted
  const header = `${iconColor(`${icon} ${tool.name}`)} ${palette.dim('·')} ${stateLabel[tool.state]}`
  const argsPreview = tool.argsPreview.length > 0
    ? palette.dim(`  ${tool.argsPreview.split('\n').join('\n  ')}`)
    : null
  const output = tool.output.length > 0
    ? palette.muted(`  → ${tool.output}`)
    : null
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{header}</Text>
      {argsPreview !== null ? <Text>{argsPreview}</Text> : null}
      {output !== null ? <Text>{output}</Text> : null}
    </Box>
  )
}