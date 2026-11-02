/**
 * Event-projection helpers (T-1 split from session-controller): pure
 * coercions and searches over session-event payloads. No state — the
 * controller orchestrates, these transform.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/event-helpers
 */

import type { Message } from './types'

/** Truncate a status-bar reason label to a single readable line. */
export function truncateLabel(text: string, max = 48): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`
}

/**
 * Find the LAST tool-call message whose record pairs with `callId`
 * (findLastIndex is not in this tsconfig's lib target).
 */
export function findToolCallIndex(messages: readonly Message[], callId: string): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.kind === 'tool-call' && message.tool?.callId === callId) return i
  }
  return -1
}

/** Render-friendly preview of an arbitrary JSON value. */
export function previewValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Truncate a preview to a UI-friendly size. */
export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}


/** Coerce a content-block array to plain text. */
export function contentToText(content: readonly unknown[]): string {
  return content
    .map(block => {
      if (typeof block === 'object' && block !== null && 'type' in block) {
        const b = block as { type: string; text?: string; content?: unknown[] }
        if (b.type === 'text' && typeof b.text === 'string') return b.text
        // Tool-result blocks keep their payload nested one level down.
        if (b.type === 'tool-result' && Array.isArray(b.content)) return contentToText(b.content)
      }
      return ''
    })
    .join('')
}
