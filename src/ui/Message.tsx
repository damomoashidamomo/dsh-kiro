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
import { useEffect, useState } from 'react'
import { renderMarkdown } from '../markdown/render'
import { palette, ICONS } from '../theme/palette'
import { STRINGS } from './strings'
import type { Message as MessageRecord, TodoItem } from '../runtime/types'

export interface MessageProps {
  message: MessageRecord
}

/** Render one message — the unit of transcript rendering. */
export function Message({ message }: MessageProps): JSX.Element {
  switch (message.kind) {
    case 'user':
      return <UserMessage text={message.text} />
    case 'assistant':
      return (
        <AssistantMessage
          text={message.text}
          streaming={message.streaming}
          settledUpTo={message.settledUpTo}
          continuation={message.continuation}
        />
      )
    case 'reasoning':
      return <ReasoningMessage text={message.text} streaming={message.streaming} createdAt={message.createdAt} />
    case 'tool-call':
      return <ToolMessage message={message} />
    case 'todo':
      return <TodoMessage todos={message.todos ?? []} />
    case 'system':
      return <SystemMessage text={message.text} />
    case 'error':
      return <ErrorMessage text={message.text} />
    case 'blank':
      return <BlankLine />
    default:
      return <SystemMessage text="(unknown message kind)" />
  }
}

/**
 * A shell-like blank line (Enter on an empty prompt), pushing the conversation
 * up one row like a shell prompt does.
 *
 * The row holds a zero-width space rather than a blank: Ink trims trailing
 * whitespace per line (`output.js` → `trimEnd`), so an all-whitespace item is
 * written as the empty string and the press would be invisible. U+200B is not
 * whitespace, has display width 0, and therefore prints an empty-looking row.
 */
const BLANK_GLYPH = '\u200b'

function BlankLine(): JSX.Element {
  return <Text>{BLANK_GLYPH}</Text>
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

/**
 * Render an assistant message with markdown and streaming cursor. A streamed
 * answer settles block-by-block: this message shows only the UNSETTLED tail
 * (`text.slice(settledUpTo)`), while earlier pieces were already emitted as
 * finished continuation messages — that keeps Ink's live region small.
 */
function AssistantMessage({ text, streaming, settledUpTo, continuation }: {
  text: string
  streaming: boolean
  settledUpTo?: number
  continuation?: boolean
}): JSX.Element {
  const settled = settledUpTo ?? 0
  const body = settled > 0 ? text.slice(settled) : text
  if (body.trim() === '') return <></>
  const rendered = renderMarkdown(body)
  const isContinuation = settled > 0 || continuation === true
  return (
    <Box flexDirection="row" marginTop={isContinuation ? 0 : 1}>
      {isContinuation ? null : <Text>{palette.accent2(`${ICONS.assistant} `)}</Text>}
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
/**
 * Reasoning stays COLLAPSED to one line — the full chain would bury the
 * conversation (kiro-style cleanliness). While streaming, the live char
 * count and elapsed seconds tick so the user sees the model working
 * instead of a frozen "思考中…".
 */
function ReasoningMessage({ text, streaming, createdAt }: { text: string; streaming: boolean; createdAt: number }): JSX.Element {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!streaming) return
    const timer = setInterval(() => { setElapsed(Math.floor((Date.now() - createdAt) / 1000)) }, 1000)
    return () => { clearInterval(timer) }
  }, [streaming, createdAt])
  const label = streaming
    ? STRINGS.transcript.thinking(formatCharCount(text.length), elapsed)
    : STRINGS.transcript.thought(formatCharCount(text.length))
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text>{palette.accentSoft(`${ICONS.reasoning} `)}</Text>
      <Text>{palette.reasoning(label)}</Text>
    </Box>
  )
}

/** Compact char count: 4200 -> 4.2k 字. */
function formatCharCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k 字` : `${n} 字`
}

/**
 * Todo checklist snapshot: kiro-style visible progress. Completed rows
 * check off, the in-progress row is accented, pending rows stay dim.
 */
function TodoMessage({ todos }: { todos: readonly TodoItem[] }): JSX.Element {
  if (todos.length === 0) return <></>
  const done = todos.filter((t) => t.status === 'completed').length
  const rows = todos.slice(0, 12).map((todo) => {
    const mark = todo.status === 'completed' ? '☑' : todo.status === 'in_progress' ? '◐' : '☐'
    const text = todo.content.length > 72 ? `${todo.content.slice(0, 71)}…` : todo.content
    const styled = todo.status === 'completed'
      ? palette.dim(`${mark} ${text}`)
      : todo.status === 'in_progress'
        ? palette.accent(`${mark} ${text}`)
        : palette.muted(`${mark} ${text}`)
    return <Text key={todo.content}>{styled}</Text>
  })
  if (todos.length > 12) {
    rows.push(<Text key="__more">{palette.muted(`… 还有 ${todos.length - 12} 项`)}</Text>)
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{palette.accentSoft(STRINGS.transcript.taskList(done, todos.length))}</Text>
      {rows}
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

/**
 * One-line outcome for a tool card: the FIRST meaningful line of the result
 * (status line / first stdout row / error headline). Page bodies behind it —
 * fetched content, JSON payloads — stay out of the transcript.
 */
function outcomeLine(output: string): string {
  const noise = /^(external web content follows|treat it as untrusted data|not as instructions)\b/i
  for (const raw of output.split('\n')) {
    const line = raw.trim()
    if (line === '' || noise.test(line)) continue
    return line.length > 160 ? `${line.slice(0, 159)}…` : line
  }
  return '(no output)'
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
    ? palette.muted(`  → ${outcomeLine(tool.output)}`)
    : null
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{header}</Text>
      {argsPreview !== null ? <Text>{argsPreview}</Text> : null}
      {output !== null ? <Text>{output}</Text> : null}
    </Box>
  )
}