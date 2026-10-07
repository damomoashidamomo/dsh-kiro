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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  AgentStatusSnapshot,
  ApprovalChoice,
  ApprovalRequestUi,
  Message,
  OverlayKind,
  PickerItem,
  QuestionChoice,
  QuestionRequestUi,
  SessionRenderState,
  ToolRecord,
  TodoItem,
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
      planMode: false,
      permissionPreset: undefined,
    },
    todos: undefined,
    overlay: { kind: 'none' },
    picker: undefined,
    approval: undefined,
    question: undefined,
    hasActiveTool: false,
  }
}

/** Convert a session seq into a unique renderable id. */
function idFor(kind: string, seq: number): string {
  return `${kind}-${seq}`
}

/** Truncate a status-bar reason label to a single readable line. */
function truncateLabel(text: string, max = 48): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`
}

/** Path of the project-level approval store inside the workspace. */
function projectApprovalsPath(): string {
  return join(process.cwd(), '.kiro', 'approvals.json')
}

/** Read the persisted project-allowed tool names (missing file -> none). */
function loadProjectApprovals(): string[] {
  try {
    const raw = readFileSync(projectApprovalsPath(), 'utf8')
    const parsed = JSON.parse(raw) as { tools?: unknown }
    if (!Array.isArray(parsed.tools)) return []
    return parsed.tools.filter((t): t is string => typeof t === 'string' && t !== '')
  } catch {
    return []
  }
}

/** Persist the project-allowed tool names (best effort). */
function saveProjectApprovals(tools: readonly string[]): void {
  try {
    mkdirSync(join(process.cwd(), '.kiro'), { recursive: true })
    writeFileSync(projectApprovalsPath(), `${JSON.stringify({ tools: [...tools].sort() }, null, 2)}\n`, 'utf8')
  } catch {
    // Unwritable workspace: the allowance still holds for this session.
  }
}

/**
 * Find the LAST tool-call message whose record pairs with `callId`
 * (findLastIndex is not in this tsconfig's lib target).
 */
function findToolCallIndex(messages: readonly Message[], callId: string): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.kind === 'tool-call' && message.tool?.callId === callId) return i
  }
  return -1
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
        const b = block as { type: string; text?: string; content?: unknown[] }
        if (b.type === 'text' && typeof b.text === 'string') return b.text
        // Tool-result blocks keep their payload nested one level down.
        if (b.type === 'tool-result' && Array.isArray(b.content)) return contentToText(b.content)
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
  /** In-flight tool calls keyed by platform callId (parallel-safe). */
  private readonly activeTools = new Map<string, ToolRecord>()
  /**
   * Text of the most recent steer, already echoed locally as `↪ 已插话`.
   * The platform delivers the same text as a `user/message` when the next
   * step consumes it — match and drop to avoid a duplicate row.
   */
  private lastSteeredText: string | undefined

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

  /** Wipe the visible transcript without touching the durable session log. */
  clearTranscript(): void {
    this.state = { ...this.state, messages: [] }
    this.publish()
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
    this.activeTools.clear()
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
  /** Record a steered input already echoed locally (dedupe on arrival). */
  noteSteered(text: string): void {
    this.lastSteeredText = text
  }

  /** Append a todo checklist snapshot, skipping no-op duplicates. */
  private pushTodoSnapshot(todos: readonly TodoItem[]): void {
    const signature = todos.map((t) => `${t.status}:${t.content}`).join('|')
    const lastTodo = [...this.state.messages].reverse().find((m) => m.kind === 'todo')
    if (lastTodo?.text === signature) return
    const seq = this.state.messages.length + 1
    const message: Message = {
      id: idFor('todo', seq),
      kind: 'todo',
      text: signature,
      todos,
      tool: undefined,
      createdAt: Date.now(),
      seq,
      usage: undefined,
      streaming: false,
    }
    this.state = { ...this.state, messages: [...this.state.messages, message] }
  }

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

  // --- Interactive picker (kiro-style list chooser) ---

  /** Selection callback stored out-of-band (never part of the render state). */
  private pickerOnSelect: ((item: PickerItem) => void) | undefined

  /**
   * Open an interactive picker. The command handler builds the items and
   * supplies an `onSelect` closure (it owns the apply logic — persist,
   * patch, push feedback); the controller only manages selection state.
   */
  openPicker(request: {
    title: string
    items: readonly PickerItem[]
    onSelect: (item: PickerItem) => void
  }): void {
    if (request.items.length === 0) return
    // Open with the current choice highlighted, kiro-style.
    const currentIndex = request.items.findIndex((item) => item.current === true)
    this.pickerOnSelect = request.onSelect
    this.state = {
      ...this.state,
      picker: {
        title: request.title,
        items: request.items,
        selected: currentIndex >= 0 ? currentIndex : 0,
      },
    }
    this.publish()
  }

  /** Close the picker without selecting. */
  closePicker(): void {
    this.pickerOnSelect = undefined
    if (this.state.picker === undefined) return
    this.state = { ...this.state, picker: undefined }
    this.publish()
  }

  /** Move the highlighted row by `delta`, clamped to the list. */
  movePickerSelection(delta: number): void {
    const picker = this.state.picker
    if (picker === undefined || picker.items.length === 0) return
    this.setPickerSelection(picker.selected + delta)
  }

  /** Jump the highlight to an absolute index (used by filtered picker views). */
  setPickerSelection(index: number): void {
    const picker = this.state.picker
    if (picker === undefined || picker.items.length === 0) return
    const selected = Math.max(0, Math.min(picker.items.length - 1, index))
    if (selected === picker.selected) return
    this.state = { ...this.state, picker: { ...picker, selected } }
    this.publish()
  }

  /** Confirm the highlighted row: runs the opener's callback, then closes. */
  selectPickerItem(): void {
    const picker = this.state.picker
    const callback = this.pickerOnSelect
    if (picker === undefined || callback === undefined) return
    const item = picker.items[picker.selected]
    this.pickerOnSelect = undefined
    this.state = { ...this.state, picker: undefined }
    this.publish()
    if (item !== undefined) callback(item)
  }

  // --- Tool-permission approval (kiro-style ask panel) ---

  /** Resolver for the currently pending approval question, if any. */
  private approvalResolve: ((choice: ApprovalChoice) => void) | undefined
  /** Approval signal cleanup for the currently pending question. */
  private approvalSignalCleanup: (() => void) | undefined
  /** Tools the user allowed for the rest of this session (per-boot memory). */
  private readonly sessionAllowedTools = new Set<string>()

  /**
   * Project-level approvals (`.kiro/approvals.json` in the workspace):
   * tools the user marked "always allow for this project". Seeded at
   * construction and rewritten on each allow-project choice.
   */
  private readonly projectAllowedTools = new Set<string>(loadProjectApprovals())

  constructor() {
    for (const tool of this.projectAllowedTools) this.sessionAllowedTools.add(tool)
  }

  // --- Structured questions (plan review, generic asks) ---

  /** Resolver for the currently pending question, if any. */
  private questionResolve: ((choice: QuestionChoice) => void) | undefined
  /** Question signal cleanup for the currently pending question. */
  private questionSignalCleanup: (() => void) | undefined

  /**
   * Put a permission question to the user. Resolves when the UI answers,
   * or with `{ kind: 'cancelled' }` when the request signal aborts (turn
   * cancelled) or the turn closes — the approval service discards late
   * answers itself, so cancelling here only needs to close the panel.
   */
  openApproval(
    request: ApprovalRequestUi,
    signal?: { aborted: boolean; addEventListener?: (t: string, l: () => void) => unknown; removeEventListener?: (t: string, l: () => void) => unknown },
  ): Promise<ApprovalChoice> {
    this.cancelApproval()
    const promise = new Promise<ApprovalChoice>((resolve) => {
      this.approvalResolve = resolve
    })
    if (signal !== undefined) {
      if (signal.aborted) {
        this.approvalResolve = undefined
        return Promise.resolve({ kind: 'cancelled' })
      }
      if (typeof signal.addEventListener === 'function') {
        const onAbort = (): void => { this.cancelApproval() }
        signal.addEventListener('abort', onAbort)
        this.approvalSignalCleanup = () => {
          signal.removeEventListener?.('abort', onAbort)
        }
      }
    }
    this.state = { ...this.state, approval: request }
    this.publish()
    return promise
  }

  /** Answer the pending question (UI path) and close the panel. */
  resolveApproval(choice: ApprovalChoice): void {
    const resolve = this.approvalResolve
    this.approvalSignalCleanup?.()
    this.approvalSignalCleanup = undefined
    this.approvalResolve = undefined
    if (this.state.approval !== undefined) {
      this.state = { ...this.state, approval: undefined }
      this.publish()
    }
    resolve?.(choice)
  }

  /** Withdraw the question without a user answer (signal/turn end). */
  cancelApproval(): void {
    const resolve = this.approvalResolve
    this.approvalSignalCleanup?.()
    this.approvalSignalCleanup = undefined
    this.approvalResolve = undefined
    if (this.state.approval !== undefined) {
      this.state = { ...this.state, approval: undefined }
      this.publish()
    }
    resolve?.({ kind: 'cancelled' })
  }

  /** Whether the user allowed this tool for the whole session. */
  isToolAllowedForSession(toolName: string): boolean {
    return this.sessionAllowedTools.has(toolName)
  }

  /** Remember a session-wide allowance for this tool (本会话始终允许). */
  allowToolForSession(toolName: string): void {
    this.sessionAllowedTools.add(toolName)
  }

  /** Remember a project-wide allowance (本项目始终允许) and persist it. */
  allowToolForProject(toolName: string): void {
    this.sessionAllowedTools.add(toolName)
    this.projectAllowedTools.add(toolName)
    saveProjectApprovals([...this.projectAllowedTools])
  }

  /**
   * Put a structured question to the user (plan review, generic ask).
   * Resolves when the UI answers, or with `{ kind: 'dismissed' }` when the
   * request signal aborts or the turn closes — the caller maps a dismissal
   * to ASK_CANCELLED semantics (stay and wait for the user's own words).
   */
  openQuestion(
    request: QuestionRequestUi,
    signal?: { aborted: boolean; addEventListener?: (t: string, l: () => void) => unknown; removeEventListener?: (t: string, l: () => void) => unknown },
  ): Promise<QuestionChoice> {
    this.cancelQuestion()
    const promise = new Promise<QuestionChoice>((resolve) => {
      this.questionResolve = resolve
    })
    if (signal !== undefined) {
      if (signal.aborted) {
        this.questionResolve = undefined
        return Promise.resolve({ kind: 'dismissed' })
      }
      if (typeof signal.addEventListener === 'function') {
        const onAbort = (): void => { this.cancelQuestion() }
        signal.addEventListener('abort', onAbort)
        this.questionSignalCleanup = () => {
          signal.removeEventListener?.('abort', onAbort)
        }
      }
    }
    this.state = { ...this.state, question: request }
    this.publish()
    return promise
  }

  /** Answer the pending question (UI path) and close the panel. */
  resolveQuestion(choice: QuestionChoice): void {
    const resolve = this.questionResolve
    this.questionSignalCleanup?.()
    this.questionSignalCleanup = undefined
    this.questionResolve = undefined
    if (this.state.question !== undefined) {
      this.state = { ...this.state, question: undefined }
      this.publish()
    }
    resolve?.(choice)
  }

  /** Withdraw the question without a user answer (signal/turn end). */
  cancelQuestion(): void {
    const resolve = this.questionResolve
    this.questionSignalCleanup?.()
    this.questionSignalCleanup = undefined
    this.questionResolve = undefined
    if (this.state.question !== undefined) {
      this.state = { ...this.state, question: undefined }
      this.publish()
    }
    resolve?.({ kind: 'dismissed' })
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
        // A closed turn withdraws any pending approval question or structured
        // question (both are turn-enclosed by design); late answers are
        // discarded upstream.
        this.cancelApproval()
        this.cancelQuestion()
        // Surface the real failure instead of a bare "error" chip: LlmFailure
        // carries the driver message (e.g. missing API key, bad model id).
        let label: string = reason.kind
        if (reason.kind === 'error') {
          const message = typeof reason.error?.message === 'string' ? reason.error.message : 'unknown error'
          label = `error: ${truncateLabel(message)}`
          this.pushSystem(`✗ 回合失败：${message}`)
        }
        this.state = {
          ...this.state,
          agent: {
            ...this.state.agent,
            status: reason.kind === 'completed' ? 'idle' : 'error',
            lastTurnReason: label,
          },
          hasActiveTool: false,
        }
        this.activeTools.clear()
        this.sweepOrphanedToolCalls()
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
        this.closeStreamingReasoning()
        const data = event.data as { turn: number; step: number; callId: string; name: string; arguments: string }
        const seq = Number(event.seq)
        const record: ToolRecord = {
          id: idFor('tool-call', seq),
          callId: data.callId,
          argsRaw: typeof data.arguments === 'string'
            ? data.arguments
            : (data.arguments !== undefined ? JSON.stringify(data.arguments) : undefined),
          name: data.name,
          argsPreview: truncate(previewValue(data.arguments), 240),
          state: 'running',
          output: '',
          outputSpillPath: undefined,
          durationMs: undefined,
          metadata: {},
        }
        this.activeTools.set(data.callId, record)
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
          hasActiveTool: this.activeTools.size > 0,
          messages: [...this.state.messages, message],
        }
        this.publish()
        return
      }
      case 'tool/result': {
        const data = event.data as {
          message: { content: { type?: string; toolCallId?: string }[] }
          error?: { name: string; code: string }
        }
        const text = contentToText(data.message.content)
        // Correlate by the platform's callId (result content[0].toolCallId)
        // rather than positional trust: parallel calls and interleaved
        // assistant text mean the matching call is not necessarily last.
        const callId = data.message.content.find((block) => typeof block?.toolCallId === 'string')?.toolCallId
        const finished = callId !== undefined ? this.activeTools.get(callId) : undefined
        if (finished !== undefined && callId !== undefined) {
          this.activeTools.delete(callId)
          finished.state = data.error !== undefined ? 'failed' : 'done'
          finished.output = truncate(text, 800)
          const index = findToolCallIndex(this.state.messages, callId)
          const target = index >= 0 ? this.state.messages[index] : undefined
          finished.durationMs = Date.now() - (target?.createdAt ?? Date.now())
          if (target !== undefined) {
            const updated: Message = { ...target, tool: { ...finished }, streaming: false }
            const messages = [...this.state.messages]
            messages[index] = updated
            this.state = {
              ...this.state,
              hasActiveTool: this.activeTools.size > 0,
              messages,
            }
          } else {
            this.state = { ...this.state, hasActiveTool: this.activeTools.size > 0 }
          }
          this.publish()
        }
        return
      }
      case 'request/context': {
        const data = event.data as { provider?: string; model?: string; contextWindow?: number }
        // The adapter's effective window for THIS request (catalog value or
        // its route-level default) — the same truth the Web UI's token-meter
        // projection renders. Lands before the request runs, so the bar is
        // correct from the first turn and after any model switch.
        if (typeof data.contextWindow === 'number' && Number.isFinite(data.contextWindow) && data.contextWindow > 0) {
          this.state = {
            ...this.state,
            agent: {
              ...this.state.agent,
              contextLimitTokens: data.contextWindow,
              ...(data.provider !== undefined ? { activeProvider: data.provider } : {}),
              ...(data.model !== undefined ? { activeModel: data.model } : {}),
            },
          }
          this.publish()
        } else if (data.provider !== undefined || data.model !== undefined) {
          this.state = {
            ...this.state,
            agent: {
              ...this.state.agent,
              ...(data.provider !== undefined ? { activeProvider: data.provider } : {}),
              ...(data.model !== undefined ? { activeModel: data.model } : {}),
            },
          }
          this.publish()
        }
        return
      }
      case 'user/message': {
        const data = event.data as { content?: unknown[]; source?: { kind?: string } }
        // Only what the user actually typed/attached: platform-injected
        // notices (compaction summaries, queue texts) use other source kinds.
        if (data.source?.kind !== 'user') return
        const text = contentToText(data.content ?? []).trim()
        if (text === '') return
        if (text === this.lastSteeredText) {
          this.lastSteeredText = undefined
          return
        }
        const seq = this.state.messages.length + 1
        const message: Message = {
          id: idFor('user', seq),
          kind: 'user',
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
      default: {
        // `plan/mode` (dsh-plan-mode) and `permission/preset`
        // (dsh-permission-presets) arrive via event augmentations this
        // bundle does not type-depend on — match structurally.
        const wide = event as { type?: string; data?: { active?: boolean; preset?: string } }
        if (wide.type === 'plan/mode') {
          const active = wide.data?.active === true
          this.state = {
            ...this.state,
            agent: { ...this.state.agent, planMode: active },
          }
          this.publish()
          return
        }
        if (wide.type === 'todo/write') {
          // Whole-list snapshot from the todo_write tool (turn/start clears
          // it upstream). Pin the list and drop a compact checklist row
          // into the transcript — kiro-style visible progress.
          const todos = (wide.data as { todos?: TodoItem[] | null }).todos ?? undefined
          this.state = { ...this.state, todos }
          if (todos !== undefined && todos.length > 0) this.pushTodoSnapshot(todos)
          this.publish()
          return
        }
        if (wide.type === 'permission/preset' && typeof wide.data?.preset === 'string') {
          this.state = {
            ...this.state,
            agent: { ...this.state.agent, permissionPreset: wide.data.preset },
          }
          this.publish()
        }
        return
      }
    }
  }

  /**
   * Close any tool-call message still marked streaming (a result that never
   * correlated, or a turn cancelled mid-call). A stuck `streaming` flag
   * pins every later message into Ink's live region, so the whole UI
   * re-renders each spinner tick — this sweep is the backstop.
   */
  private sweepOrphanedToolCalls(): void {
    this.closeStreamingReasoning()
    let changed = false
    const messages = this.state.messages.map((message) => {
      if (message.kind === 'tool-call' && message.streaming && message.tool !== undefined) {
        changed = true
        return {
          ...message,
          streaming: false,
          tool: { ...message.tool, state: 'failed' as const, output: message.tool.output === '' ? '(no result — turn ended)' : message.tool.output },
        }
      }
      return message
    })
    if (changed) {
      this.state = { ...this.state, messages }
    }
  }

  /**
   * Close any reasoning message still marked streaming. Reasoning deltas
   * only stream; nothing in the chunk flow closes them, yet a stuck flag
   * pins the whole later transcript into Ink's live region. Called whenever
   * the model demonstrably moved on (text, a tool call) and at turn end.
   */
  private closeStreamingReasoning(): void {
    let changed = false
    const messages = this.state.messages.map((message) => {
      if (message.kind === 'reasoning' && message.streaming) {
        changed = true
        return { ...message, streaming: false }
      }
      return message
    })
    if (changed) {
      this.state = { ...this.state, messages }
    }
  }

  /** Append to the last assistant message, creating it if absent. */
  private appendToLastAssistant(delta: string): void {
    if (delta === '') return
    this.closeStreamingReasoning()
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
