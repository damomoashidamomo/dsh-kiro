/**
 * dsh-kiro runtime types — the data shapes the UI consumes and the
 * SessionController produces. Kept framework-agnostic so the renderer (Ink),
 * the snapshot store, and any future test harness share the same contract.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/types
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** UI-facing message kinds. */
export type MessageKind =
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'tool-call'
  | 'tool-result'
  | 'system'
  | 'error'

/** Tool call execution state machine. */
export type ToolState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'

/** Single tool invocation rendered in the transcript. */
export interface ToolRecord {
  /** Stable id within the session; `call-${seq}` from the log. */
  readonly id: string
  /** The exact tool name as registered with the agent. */
  readonly name: string
  /** Argument string as the model wrote it (pretty-printed). */
  readonly argsPreview: string
  /** Current execution state. */
  state: ToolState
  /** Truncated stdout or model-facing result text. */
  output: string
  /** Spill-path hint when `output` is lossy. */
  outputSpillPath: string | undefined
  /** Wall-clock duration measured in milliseconds. */
  durationMs: number | undefined
  /** Free-form metadata from the event payload. */
  metadata: Record<string, unknown>
}

/** Single visible message in the transcript. */
export interface Message {
  /** Stable id within the session; `${kind}-${seq}`. */
  readonly id: string
  /** Whether the message originated from the user, model, or runtime. */
  readonly kind: MessageKind
  /** Plain-text body for the message; markdown is rendered separately. */
  text: string
  /** Optional tool record attached to this message. */
  tool: ToolRecord | undefined
  /** Wall-clock timestamp from the session event. */
  readonly createdAt: number
  /** Session sequence number. */
  readonly seq: number
  /** Token usage attributed to this message, when applicable. */
  usage: { input: number; output: number } | undefined
  /** Whether the assistant stream is still being appended. */
  streaming: boolean
}

/** Agent state derived from session events. */
export interface AgentStatusSnapshot {
  readonly status: 'idle' | 'running' | 'cancelling' | 'error'
  readonly activeAgent: string | undefined
  readonly activeModel: string | undefined
  readonly activeProvider: string | undefined
  readonly lastTurnReason: string | undefined
  readonly contextUsedTokens: number
  readonly contextLimitTokens: number | undefined
}

/** UI overlay state. */
export type OverlayKind =
  | { kind: 'none' }
  | { kind: 'slash-menu'; query: string }
  | { kind: 'agent-picker' }
  | { kind: 'model-picker' }
  | { kind: 'context-picker' }
  | { kind: 'tool-trust' }
  | { kind: 'mcp-panel' }
  | { kind: 'todo-panel' }
  | { kind: 'checkpoint-panel' }
  | { kind: 'plan-panel' }
  | { kind: 'knowledge-panel' }
  | { kind: 'help' }
  | { kind: 'chat-switcher' }
  | { kind: 'editor' }
  | { kind: 'question'; questionId: string }
  | { kind: 'approval'; approvalId: string }
  | { kind: 'progress'; label: string }
  | { kind: 'diff-view'; a: string; b: string }

/** One selectable row in an interactive picker (kiro-style list chooser). */
export interface PickerItem {
  /** Stable machine value carried back to the opener on selection. */
  readonly value: string
  /** Primary display text. */
  readonly label: string
  /** Secondary display text (right-aligned hint, e.g. provider/model id). */
  readonly hint?: string
  /** Mark this row as the currently active choice. */
  readonly current?: boolean
}

/** Live state of the interactive picker overlay. */
export interface PickerState {
  readonly title: string
  readonly items: readonly PickerItem[]
  /** Index of the highlighted row. */
  readonly selected: number
}

/** A pending tool-permission question put to the user (kiro-style approval). */
export interface ApprovalRequestUi {
  /** Tool whose operation needs the decision (e.g. `bash`). */
  readonly toolName: string
  /** Asker-supplied human-readable reason (e.g. escalation justification). */
  readonly reason: string | undefined
}

/** The user's answer to a pending {@link ApprovalRequestUi}. */
export type ApprovalChoice =
  | { readonly kind: 'allow-once' }
  | { readonly kind: 'allow-session' }
  | { readonly kind: 'deny'; readonly reason: string | undefined }
  | { readonly kind: 'cancelled' }

/** Per-session render state the SessionController publishes. */
export interface SessionRenderState {
  /** Active session id; `undefined` before the first agent is created. */
  sessionId: string | undefined
  /** Ordered transcript messages, oldest first. */
  messages: Message[]
  /** Agent state for the StatusBar. */
  agent: AgentStatusSnapshot
  /** Active overlay, if any. */
  overlay: OverlayKind
  /** Live interactive picker (kiro-style chooser), or `undefined` when closed. */
  picker: PickerState | undefined
  /** Pending tool-permission approval, or `undefined` when none. */
  approval: ApprovalRequestUi | undefined
  /** Whether a tool invocation is currently being streamed. */
  hasActiveTool: boolean
}

/** Convenience type for SessionEvent['type'] discrimination. */
export type SessionEventPayload = SessionEvent

/** Helper type for the transcript log. */
export type Transcript = readonly Message[]
