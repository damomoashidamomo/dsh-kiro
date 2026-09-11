/**
 * dsh-kiro SessionController — bridges DSH's `session/event` bus to a
 * render-friendly state object the Ink UI subscribes to. Owns no UI; it
 * builds the model and lets the renderer decide how to draw.
 *
 * The controller subscribes to one session at a time — the agent's current
 * session — so swapping sessions (via /chat resume, /chat new) re-binds the
 * listener without losing the previous transcript.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/session-controller
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  AgentStatusSnapshot,
  Message,
  OverlayKind,
  SessionRenderState,
  ToolRecord,
} from './types'

/** Subscriber callback when the render state changes. */
export type StateListener = (state: SessionRenderState) => void

/** Initial empty render state. */
function emptyState(): SessionRenderState {
  return {
    sessionId: undefined,
    messages: [],
    agent: {
      status: 'idle',
      activeAgent: undefined,
      activeModel: undefined,
      activeProvider: undefined,
      lastTurnReason: undefined,
      contextUsedTokens: 0,
      contextLimitTokens: undefined,
    },
    overlay: { kind: 'none' },
    hasActiveTool: false,
  }
}

/** Convert a session seq into a unique renderable id. */
function idFor(kind: string, seq: number): string {
  return `${kind}-${seq}`
}

/** Render-friendly preview of an arbitrary JSON value. */
function previewValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Truncate a preview to a UI-friendly size. */
function truncate(text: string, max = 120): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/** Coerce a content-block array to plain text. */
function contentToText(content: readonly unknown[]): string {
  return content
    .map(block => {
      if (typeof block === 'object' && block !== null && 'type' in block) {
        const b = block as { type: string; text?: string }
        if (b.type === 'text' && typeof b.text === 'string') return b.text
      }
      return ''
    })
    .join('')
}

/**
 * The controller that projects session events onto UI state. One instance per
 * runtime plugin; the controller does not own the agent — it follows whatever
 * agent the runtime plugin creates.
 */
export class SessionController {
  private state: SessionRenderState = emptyState()
  private readonly listeners = new Set<StateListener>()
  private agent: Agent | undefined
  private unsubscribe: (() => void) | undefined
  private activeTool: ToolRecord | undefined

  /** Subscribe to state changes. Returns the disposer. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Snapshot of the current state. */
  getState(): SessionRenderState {
    return this.state
  }

  /** Replace the controlled agent and rebind session events. */
  bindAgent(ctx: Context, agent: Agent): void {
    if (this.agent === agent) return
    this.unsubscribe?.()
    this.agent = agent
    this.state = { ...emptyState(), sessionId: String(agent.session.id) }
    this.publish()
    this.unsubscribe = ctx.on('session/event', (session, event) => {
      if (session !== agent.session) return
      this.applyEvent(event)
    })
  }

  /** Detach the controlled agent. */
  unbind(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.agent = undefined
    this.activeTool = undefined
    this.state = emptyState()
    this.publish()
  }

  /** Push a UI overlay state change. */
  setOverlay(overlay: OverlayKind): void {
    if (this.state.overlay === overlay) return
    this.state = { ...this.state, overlay }
    this.publish()
  }

  /** Append a system message to the transcript (for slash command feedback). */
  pushSystem(text: string): void {
    const seq = this.state.messages.length
    const message: Message = {
      id: idFor('system', seq),
      kind: 'system',
      text,
      tool: undefined,
      createdAt: Date.now(),
      seq,
      usage: undefined,
      streaming: false,
    }
    this.state = { ...this.state, messages: [...this.state.messages, message] }
    this.publish()
  }

  /** Patch the agent snapshot (used by status bar updates outside the event bus). */
  patchAgent(snapshot: Partial<AgentStatusSnapshot>): void {
    this.state = {
      ...this.state,
      agent: { ...this.state.agent, ...snapshot },
    }
    this.publish()
  }

  /** Notify subscribers of a state change. */
  private publish(): void {
    const snapshot = this.state
    for (const listener of this.listeners) listener(snapshot)
  }

  /** Apply one session event. */
  private applyEvent(event: SessionEvent): void {
    switch (event.type) {
      case 'turn/start': {
        this.state = {
          ...this.state,
          agent: { ...this.state.agent, status: 'running' },
        }
        this.publish()
        return
      }
      case 'turn/end': {
        const reason = event.data.reason
        this.state = {
          ...this.state,
          agent: {
            ...this.state.agent,
            status: reason.kind === 'completed' ? 'idle' : 'error',
            lastTurnReason: reason.kind,
          },
          hasActiveTool: false,
        }
        this.activeTool = undefined
        this.publish()
        return
      }
      case 'assistant/message': {
        const data = event.data as unknown as { message: { content: unknown[] } }
        const text = contentToText(data.message.content)
        const seq = Number(event.seq)
        const message: Message = {
          id: idFor('assistant', seq),
          kind: 'assistant',
          text,
          tool: undefined,
          createdAt: Date.now(),
          seq,
          usage: undefined,
          streaming: false,
        }
        this.state = { ...this.state, messages: [...this.state.messages, message] }
        this.publish()
        return
      }
      case 'assistant/chunk': {
        const chunk = (event.data as { chunk: { type: string; text?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } }).chunk
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          this.appendToLastAssistant(chunk.text)
          return
        }
        if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
          this.appendReasoning(chunk.text)
          return
        }
        if (chunk.type === 'usage' && chunk.usage !== undefined) {
          this.recordUsage(chunk.usage)
          return
        }
        return
      }
      case 'tool/call': {
        const data = event.data as { turn: number; step: number; callId: string; name: string; arguments: string }
        const seq = Number(event.seq)
        const record: ToolRecord = {
          id: idFor('tool-call', seq),
          name: data.name,
          argsPreview: truncate(previewValue(data.arguments), 240),
          state: 'running',
          output: '',
          outputSpillPath: undefined,
          durationMs: undefined,
          metadata: {},
        }
        this.activeTool = record
        const message: Message = {
          id: idFor('tool-call', seq),
          kind: 'tool-call',
          text: '',
          tool: record,
          createdAt: Date.now(),
          seq,
          usage: undefined,
          streaming: true,
        }
        this.state = {
          ...this.state,
          hasActiveTool: true,
          messages: [...this.state.messages, message],
        }
        this.publish()
        return
      }
      case 'tool/result': {
        const data = event.data as { message: { content: unknown[] }; error?: { name: string; code: string } }
        const text = contentToText(data.message.content)
        const finished = this.activeTool
        if (finished !== undefined) {
          finished.state = data.error !== undefined ? 'failed' : 'done'
          finished.output = truncate(text, 800)
          finished.durationMs = Date.now() - (this.state.messages.at(-1)?.createdAt ?? Date.now())
          this.activeTool = undefined
          const last = this.state.messages.at(-1)
          if (last !== undefined) {
            const updated: Message = { ...last, tool: { ...finished }, streaming: false }
            this.state = {
              ...this.state,
              hasActiveTool: false,
              messages: [...this.state.messages.slice(0, -1), updated],
            }
          }
          this.publish()
        }
        return
      }
      default:
        return
    }
  }

  /** Append to the last assistant message, creating it if absent. */
  private appendToLastAssistant(delta: string): void {
    if (delta === '') return
    const messages = [...this.state.messages]
    const last = messages.at(-1)
    if (last?.kind === 'assistant') {
      messages[messages.length - 1] = { ...last, text: last.text + delta, streaming: true }
    } else {
      messages.push({
        id: idFor('assistant', messages.length),
        kind: 'assistant',
        text: delta,
        tool: undefined,
        createdAt: Date.now(),
        seq: messages.length,
        usage: undefined,
        streaming: true,
      })
    }
    this.state = { ...this.state, messages }
    this.publish()
  }

  /** Append a reasoning block to a dedicated message. */
  private appendReasoning(delta: string): void {
    if (delta === '') return
    const messages = [...this.state.messages]
    const last = messages.at(-1)
    if (last?.kind === 'reasoning') {
      messages[messages.length - 1] = { ...last, text: last.text + delta, streaming: true }
    } else {
      messages.push({
        id: idFor('reasoning', messages.length),
        kind: 'reasoning',
        text: delta,
        tool: undefined,
        createdAt: Date.now(),
        seq: messages.length,
        usage: undefined,
        streaming: true,
      })
    }
    this.state = { ...this.state, messages }
    this.publish()
  }

  /** Record the latest token-usage sample for the StatusBar. */
  private recordUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): void {
    const input = usage.inputTokens ?? 0
    const output = usage.outputTokens ?? 0
    const total = usage.totalTokens ?? input + output
    this.state = {
      ...this.state,
      agent: { ...this.state.agent, contextUsedTokens: total },
    }
    const messages = [...this.state.messages]
    const last = messages.at(-1)
    if (last?.kind === 'assistant') {
      messages[messages.length - 1] = { ...last, usage: { input, output } }
      this.state = { ...this.state, messages }
    }
    this.publish()
  }
}
