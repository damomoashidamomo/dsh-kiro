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

/** Sticky banner rendered once at the top of the transcript. */
export interface SplashItem {
  readonly kind: 'splash'
  readonly key: string
  readonly content: string
}

export interface TranscriptProps {
  /** All rendered messages. */
  messages: readonly MessageRecord[]
  /** Optional sticky header rendered once above the messages (e.g. the splash banner). */
  header?: SplashItem
}

/** Items fed to Ink's `<Static>`: the header plus one entry per finished message. */
type StaticItem = SplashItem | (MessageRecord & { key: string })

/**
 * Render the transcript. Static optimizes finished messages so re-renders on
 * streaming updates stay cheap. The current live message stays outside Static
 * by appending to the array only after the message completes.
 *
 * NOTE: Ink keeps a single `staticNode` reference on the root, so the whole
 * app may only mount ONE `<Static>` subtree. The splash banner is therefore
 * passed in as a `header` item here instead of rendering its own `<Static>`.
 */
export function Transcript({ messages, header }: TranscriptProps): JSX.Element {
  // Stable partition: a message is finished only once `streaming` clears.
  // Static takes the all-finished PREFIX — everything up to (exclusive) the
  // FIRST still-streaming message. Parallel calls mean an early streaming
  // message can precede later ones; freezing such a prefix into Static
  // would pin its running card forever (Static prints items once).
  const firstStreaming = findFirstStreaming(messages)
  const finished = firstStreaming >= 0
    ? messages.slice(0, firstStreaming)
    : messages
  const live = firstStreaming >= 0
    ? messages.slice(firstStreaming)
    : []
  const staticItems: StaticItem[] = [
    ...(header ? [header] : []),
    ...finished.map((m, i) => ({ ...m, key: `${m.id}-${i}` })),
  ]

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={staticItems}>
        {(item: StaticItem) => item.kind === 'splash' ? (
          <Box key={item.key} flexDirection="column" marginTop={1}>
            <Text>{item.content}</Text>
          </Box>
        ) : (
          <Box key={item.key} flexDirection="column">
            <Message message={item} />
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

function findFirstStreaming(items: readonly MessageRecord[]): number {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (item !== undefined && item.streaming) return i
  }
  return -1
}
