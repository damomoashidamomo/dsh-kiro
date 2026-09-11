/**
 * Transcript — the scrollable log of past messages. Uses Ink's `Static`
 * component so messages stay rendered once written; the in-flight streaming
 * message lives outside Static so it can be mutated cheaply.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Transcript
 */

import { Static, Box, Text } from 'ink'
import { Message } from './Message'
import type { Message as MessageRecord } from '../runtime/types'

export interface TranscriptProps {
  /** All rendered messages. */
  messages: readonly MessageRecord[]
}

/**
 * Render the transcript. Static optimizes finished messages so re-renders on
 * streaming updates stay cheap. The current live message stays outside Static
 * by appending to the array only after the message completes.
 */
export function Transcript({ messages }: TranscriptProps): JSX.Element {
  // Stable partition: anything with `streaming: false` is finished.
  const lastStreaming = findLastIndex(messages, m => m.streaming)
  const finished = lastStreaming >= 0
    ? messages.slice(0, lastStreaming)
    : messages
  const live = lastStreaming >= 0
    ? messages.slice(lastStreaming)
    : []

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={finished.map((m, i) => ({ ...m, key: `${m.id}-${i}` }))}>
        {(message: MessageRecord) => (
          <Box key={message.id} flexDirection="column">
            <Message message={message} />
          </Box>
        )}
      </Static>
      {live.map((message) => (
        <Box key={`live-${message.id}`} flexDirection="column">
          <Message message={message} />
        </Box>
      ))}
      {messages.length === 0 ? (
        <Box marginTop={2}>
          <Text dimColor>(empty — type a message and press Enter to start)</Text>
        </Box>
      ) : null}
    </Box>
  )
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item !== undefined && predicate(item)) return i
  }
  return -1
}
