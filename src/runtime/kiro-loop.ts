/**
 * kiro-loop — dsh-kiro's own turn driver (P2: full tool loop).
 *
 * Instead of routing a submission into the platform's dsh-agent-loop, this
 * driver calls `ctx.llm.stream` directly with a locally assembled history and
 * tool schemas from `ctx.tools`, executes requested tools through the
 * platform tool pipeline (so sandbox / guards / approvals all apply — the
 * seam the P0 probe verified), feeds results back, and repeats until the
 * model stops calling tools. It fabricates the SAME durable event shapes the
 * platform loop emits, so the projection and UI render identically.
 *
 * Loop-hardening (P2, per the reviewed architecture):
 * - toolsSettings matrix (`.kiro/tools.json`, kiro-cli-compatible) evaluated
 *   BEFORE dispatch: deny-first, anchored regex, path globs,
 *   autoAllowReadonly for read-only shell commands.
 * - retry with backoff + stalled-stream protection: transient failures
 *   (rate-limit / 5xx / timeout) re-request up to twice; a stream silent for
 *   STALL_MS is aborted and retried.
 * - auto-compaction: usage beyond COMPACT_AT of the declared window
 *   summarizes the history (one extra LLM call) and keeps the tail verbatim.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/kiro-loop
 */

import type { Context } from '@deepseek-ai/cordis'
import { classifyTurnFailure } from './turn-failure'
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadToolsSettings, verdictFor } from './tool-settings'
import { toEngineCall, runEngineCall, engineBinary } from '../engine/bridge'

/** Minimal chat message the driver keeps. */
export interface LoopMessage {
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly toolCalls?: readonly { id: string; name: string; arguments: string }[]
  readonly toolResults?: readonly { toolCallId: string; content: string; isError: boolean }[]
}

/** Structural slice of ctx.llm the driver uses. */
interface LlmLike {
  stream(options: unknown): AsyncIterable<LoopChunk>
}

type LoopChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'block-end'; block: { type: string; id?: string; name?: string; arguments?: string } & Record<string, unknown> }
  | { type: 'usage'; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }
  | { type: 'finish'; reason: { kind: string } }
  | { type: string; [key: string]: unknown }

interface ToolsLike {
  schemas(): { name: string }[]
  execute(exec: { callId: string; name: string; arguments: unknown; agent?: unknown; signal: AbortSignal }): Promise<{
    isError: boolean
    content: { type: string; text?: string }[]
    value?: unknown
    error?: { message?: string }
  }>
}

export interface LoopDriverDeps {
  readonly ctx: Context
  readonly controller: { ingestEvent(event: unknown): void }
  readonly systemPrompt: () => string
  readonly selection: () => { provider: string; model: string; reasoningEffort?: string }
  /** Declared context window of the current model (tokens), when known. */
  readonly contextWindow?: () => number | undefined
  /** The platform agent on whose behalf tools run (A1: approvals are
   *  agent-scoped; without this the platform approval waterfall never fires
   *  and tools execute unapproved). */
  readonly agent?: () => unknown
  /**
   * The agent-scoped context (A1): the platform loop dispatches tools from
   * the agent scope, and the SCOPED tools view is what routes the approval
   * waterfall to agent-scoped listeners — our answerer. Taking ctx.tools
   * from the runtime scope left approval requests undeliverable.
   */
  readonly agentCtx?: () => unknown
  /**
   * A1/A2: kiro-loop's OWN approval gate — the same panel, trust store, and
   * scope semantics the platform loop reaches through its waterfall, called
   * directly so BOTH tool engines (platform pipeline and Rust) are gated
   * identically. Returns 'allowed-once' | 'rejected' | 'cancelled'.
   */
  readonly approvalGate?: (req: { toolName: string; signal: AbortSignal }) => Promise<string>
  /** Permission preset: 'danger-full-access' auto-allows the gate. */
  readonly permissionPreset?: () => string | undefined
}

const MAX_STEPS = 24
const SIDECAR_ROTATE_BYTES = 5 * 1024 * 1024
const MAX_RETRIES = 2
const STALL_MS = 25000
const COMPACT_AT = 0.8
const PARALLEL_LIMIT = 4
/** Read-only tools that may overlap within one round (P3 parallel dispatch). */
const PARALLEL_SAFE = new Set(['read', 'fs_read', 'read_file', 'grep', 'glob', 'ls', 'web_search', 'kiro_think'])

/** One turn driver instance per mode switch. */
export class KiroLoopDriver {
  private history: LoopMessage[] = []
  private abort: AbortController | undefined
  private settings = loadToolsSettings()
  /** Tool engine preference (/tools rust|dsh); rust needs engineBinary(). */
  engine: 'dsh' | 'rust' = 'dsh'
  workspaceRoot = process.cwd()

  constructor(private readonly deps: LoopDriverDeps) {}

  /** Reload `.kiro/tools.json` (after the user edits the matrix). */
  reloadSettings(): void {
    this.settings = loadToolsSettings()
  }

  /** Whether the Rust engine binary is available right now. */
  engineAvailable(): boolean {
    return engineBinary() !== undefined
  }

  /** Seed the chat history from already-rendered transcript messages. */
  seed(messages: readonly { kind: string; text: string }[]): void {
    this.history = messages
      .filter((m) => (m.kind === 'user' || m.kind === 'assistant') && m.text.trim() !== '')
      .map((m) => ({ role: m.kind === 'user' ? 'user' as const : 'assistant' as const, text: m.text }))
  }

  private steering: string[] = []
  private traceLog: Array<{ at: number; text: string }> = []

  /** T1: recent loop trace entries (newest last), for /loop trace. */
  trace(limit = 40): readonly { at: number; text: string }[] {
    return this.traceLog.slice(-limit)
  }

  private traced(text: string): void {
    this.traceLog.push({ at: Date.now(), text })
    if (this.traceLog.length > 400) this.traceLog.splice(0, this.traceLog.length - 400)
  }

  get busy(): boolean {
    return this.abort !== undefined
  }

  /** A4: queue a mid-turn interjection; consumed at the next step boundary. */
  steer(text: string): void {
    if (text.trim() !== '') this.steering.push(text.trim())
  }

  cancel(): void {
    this.abort?.abort()
  }

  private get llm(): LlmLike | undefined {
    return (this.deps.ctx as unknown as { llm?: LlmLike }).llm
  }

  private get tools(): ToolsLike | undefined {
    // Prefer the agent-scoped view (approval waterfall routing); fall back
    // to the runtime scope for the no-agent edge cases.
    const agentCtx = this.deps.agentCtx?.() as { tools?: ToolsLike } | undefined
    return agentCtx?.tools ?? (this.deps.ctx as unknown as { tools?: ToolsLike }).tools
  }

  /** Run one full turn (inner tool loop until the model stops calling tools). */
  async runTurn(userText: string): Promise<void> {
    if (this.abort !== undefined) return
    const llm = this.llm
    if (llm === undefined) throw new Error('kiro-loop: llm 服务不可用')
    this.abort = new AbortController()
    const persisted = new Set(['user/message', 'assistant/message', 'tool/call', 'tool/result', 'turn/start', 'turn/end', 'todo/write', 'system/message'])
    const emit = (event: unknown): void => {
      this.deps.controller.ingestEvent(event)
      const type = (event as { type?: string }).type
      if (type !== undefined && persisted.has(type)) {
        appendSidecar(this.workspaceRoot, { at: Date.now(), event })
      }
    }

    // A5: expand @file mentions into model-visible content (the platform
    // loop does this in request assembly; the own loop owns it here). The
    // transcript keeps the original text.
    const expanded = expandMentions(userText, this.workspaceRoot)
    this.history.push({ role: 'user', text: expanded })
    emit({ type: 'turn/start', seq: 0, data: { turn: 1 } })
    emit({ type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: userText }], source: { kind: 'user' } } })

    try {
      for (let step = 0; step < MAX_STEPS; step += 1) {
        if (step > 0 && this.steering.length > 0) {
          // A4: mid-turn interjections ride as user messages between steps
          // (kiro-style steering; no cancel needed).
          for (const note of this.steering.splice(0)) {
            this.traced(`插话：${note.slice(0, 40)}`)
            this.history.push({ role: 'user', text: note })
            emit({ type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: note }], source: { kind: 'user' } } })
          }
        }
        this.traced(`step ${step + 1}: 请求模型（历史 ${this.history.length} 条）`)
        await this.maybeCompact(llm, emit)
        const { text, toolCalls, finish } = await this.streamWithRetry(llm, emit)
        this.traced(`step ${step + 1}: 完成（finish=${finish}，工具 ${toolCalls.length} 个）`)
        this.history.push({ role: 'assistant', text, ...(toolCalls.length > 0 ? { toolCalls } : {}) })
        emit({ type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text }] } } })
        if (finish !== 'tool-calls' || toolCalls.length === 0) break

        const results = await this.executeCalls(toolCalls, step, emit)
        this.history.push({ role: 'user', text: '', toolResults: results })
      }
      emit({ type: 'turn/end', seq: 9, data: { reason: { kind: 'completed' } } })
    } catch (error) {
      const aborted = this.abort?.signal.aborted === true
      emit({
        type: 'turn/end',
        seq: 9,
        data: {
          reason: aborted
            ? { kind: 'cancelled' }
            : { kind: 'error', error: { message: error instanceof Error ? error.message : String(error) } },
        },
      })
    } finally {
      this.abort = undefined
    }
  }

  /** One model request with backoff retry and stalled-stream protection. */
  private async streamWithRetry(llm: LlmLike, emit: (event: unknown) => void): Promise<{
    text: string
    toolCalls: { id: string; name: string; arguments: string }[]
    finish: string
  }> {
    const { provider, model, reasoningEffort } = this.deps.selection()
    const schemas = this.tools?.schemas() ?? []
    if (process.env.KIRO_SCHEMAS_DEBUG === '1') {
      try { appendFileSync('/tmp/kiro-schemas.log', schemas.map((x) => x.name).join(',') + '\n') } catch { }
    }
    let lastError: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const turnAbort = this.abort!
      try {
        return await this.streamOnce(llm, {
          provider,
          model,
          ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
          system: this.deps.systemPrompt(),
          ...(schemas.length > 0 ? { tools: schemas } : {}),
          messages: this.wireMessages(),
          signal: turnAbort.signal,
        }, emit)
      } catch (error) {
        lastError = error
        if (turnAbort.signal.aborted) throw error
        const transient = classifyTurnFailure(
          error as never,
          error instanceof Error ? error.message : String(error),
        ).transient
        if (!transient || attempt === MAX_RETRIES) throw error
        this.traced(`重试 ${attempt + 1}/${MAX_RETRIES}（${error instanceof Error ? error.message.slice(0, 80) : String(error)}）`)
        emit({ type: 'system/message', seq: 8, data: { text: `↻ 网络抖动，${attempt + 1}s 后自动重试（${attempt + 1}/${MAX_RETRIES}）…` } })
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000))
      }
    }
    throw lastError
  }

  /** One streaming pass; a silent stream for STALL_MS aborts as a timeout. */
  private async streamOnce(llm: LlmLike, options: unknown, emit: (event: unknown) => void): Promise<{
    text: string
    toolCalls: { id: string; name: string; arguments: string }[]
    finish: string
  }> {
    let text = ''
    const toolCalls: { id: string; name: string; arguments: string }[] = []
    let finish = 'stop'
    const iterator = llm.stream(options)[Symbol.asyncIterator]()
    try {
      while (true) {
        const next = await Promise.race([
          iterator.next(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out: stream stalled')), STALL_MS)),
        ])
        if (next.done === true) break
        const chunk = next.value as LoopChunk
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          text += chunk.text
          emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'text-delta', text: chunk.text } } })
        } else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
          emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'reasoning-delta', text: chunk.text } } })
        } else if (chunk.type === 'block-end') {
          const block = (chunk as { block?: { type?: string; id?: string; name?: string; arguments?: string } }).block
          if (block?.type === 'tool-call') {
            toolCalls.push({
              id: String(block.id ?? ''),
              name: String(block.name ?? ''),
              arguments: String(block.arguments ?? '{}'),
            })
          }
        } else if (chunk.type === 'usage') {
          emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'usage', usage: (chunk as { usage?: unknown }).usage } } })
        } else if (chunk.type === 'finish') {
          const kind = (chunk as { reason?: { kind?: string } }).reason?.kind ?? 'stop'
          // Some adapters emit a trailing second finish after the real one;
          // the first reason wins (a later 'stop' must not clobber
          // 'tool-calls' and silently end the loop).
          if (finish === 'stop') finish = kind
        }
      }
    } finally {
      void iterator.return?.().catch(() => undefined)
    }
    // Blocks speak for themselves: collected tool-call blocks always mean
    // the model wants tools, whatever the (possibly clobbered) finish said.
    const effectiveFinish = toolCalls.length > 0 ? 'tool-calls' : finish
    return { text, toolCalls, finish: effectiveFinish }
  }

  /** toolsSettings verdict -> platform execute (or a synthesized refusal). */
  private async executeTool(call: { id: string; name: string; arguments: string }): Promise<{ toolCallId: string; content: string; isError: boolean }> {
    let args: unknown = {}
    try {
      args = JSON.parse(call.arguments)
    } catch {
      args = {}
    }
    const verdict = verdictFor(this.settings, call.name, args)
    if (verdict === 'deny') {
      return { toolCallId: call.id, content: 'denied by workspace toolsSettings (.kiro/tools.json)', isError: true }
    }
    // A1/A2: the confirmation habit, applied to BOTH engines. toolsSettings
    // 'allow' already carries the workspace's consent; everything else goes
    // through the approval panel (trust patterns auto-allow inside the gate)
    // unless the session preset is danger-full-access.
    if (verdict === 'prompt' && this.deps.approvalGate !== undefined) {
      const preset = this.deps.permissionPreset?.()
      if (preset !== 'danger-full-access') {
        const outcome = await this.deps.approvalGate({ toolName: call.name, signal: this.abort!.signal })
        if (outcome !== 'allowed-once') {
          return { toolCallId: call.id, content: `用户拒绝执行 ${call.name}（${outcome}）。请调整方案，不要原样重试。`, isError: true }
        }
      }
    }
    // Rust engine path (/tools rust): a freshly Landlock-sandboxed process
    // per call; anything the engine cannot serve falls through to the
    // platform pipeline below.
    if (this.engine === 'rust') {
      const engineCall = toEngineCall(call.name, args)
      if (engineCall !== undefined) {
        const reply = await runEngineCall(engineCall, this.workspaceRoot)
        if (reply.ok) {
          return { toolCallId: call.id, content: JSON.stringify(reply.result ?? {}), isError: false }
        }
        if (!String(reply.error ?? '').includes('engine binary not built')) {
          return { toolCallId: call.id, content: `rust engine: ${String(reply.error ?? 'failed')}`, isError: true }
        }
      }
    }
    const tools = this.tools
    if (tools === undefined) {
      return { toolCallId: call.id, content: 'tool runtime unavailable', isError: true }
    }
    try {
      const agent = this.deps.agent?.()
      const result = await tools.execute({
        callId: call.id,
        name: call.name,
        arguments: args,
        ...(agent !== undefined ? { agent } : {}),
        signal: this.abort!.signal,
      })
      const text = (result.content ?? [])
        .map((block) => (typeof block.text === 'string' ? block.text : ''))
        .join('\n')
      return { toolCallId: call.id, content: text !== '' ? text : JSON.stringify(result.value ?? ''), isError: result.isError }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { toolCallId: call.id, content: `tool error: ${message}`, isError: true }
    }
  }

  /**
   * Execute one round's tool calls. When every call is read-only-safe
   * (P3 parallel dispatch, capped at 4 in flight) the round overlaps —
   * matches how Claude Code / kiro-cli fan out independent reads. Any
   * mutating call (bash / write / edit...) forces the whole round sequential.
   */
  private async executeCalls(
    calls: readonly { id: string; name: string; arguments: string }[],
    step: number,
    emit: (event: unknown) => void,
  ): Promise<Array<{ toolCallId: string; content: string; isError: boolean }>> {
    const emitCall = (call: { id: string; name: string; arguments: string }): void => {
      emit({ type: 'tool/call', seq: 4, data: { turn: 1, step, callId: call.id, name: call.name, arguments: call.arguments } })
    }
    const emitResult = (callId: string, result: { content: string }): void => {
      emit({
        type: 'tool/result',
        seq: 5,
        data: {
          turn: 1,
          step,
          message: {
            role: 'user',
            content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: result.content }] }],
          },
        },
      })
    }
    const runOne = async (call: { id: string; name: string; arguments: string }): Promise<{ toolCallId: string; content: string; isError: boolean }> => {
      emitCall(call)
      const result = await this.executeTool(call)
      emitResult(call.id, result)
      return result
    }

    const parallelizable = calls.length > 1
      && calls.every((call) => PARALLEL_SAFE.has(call.name))
      && this.engine !== 'rust' // one sandboxed engine process at a time
    if (!parallelizable) {
      const results: Array<{ toolCallId: string; content: string; isError: boolean }> = []
      for (const call of calls) results.push(await runOne(call))
      return results
    }
    const batches: typeof calls[] = []
    for (let i = 0; i < calls.length; i += PARALLEL_LIMIT) {
      batches.push(calls.slice(i, i + PARALLEL_LIMIT))
    }
    const results: Array<{ toolCallId: string; content: string; isError: boolean }> = []
    for (const batch of batches) {
      results.push(...await Promise.all(batch.map((call) => runOne(call))))
    }
    return results
  }

  /** Compact history when usage exceeds COMPACT_AT of the declared window. */
  private async maybeCompact(llm: LlmLike, emit: (event: unknown) => void): Promise<void> {
    const window = this.deps.contextWindow?.()
    if (window === undefined || window <= 0 || this.history.length < 6) return
    const chars = this.history.reduce((sum, m) => sum + m.text.length, 0)
    const roughTokens = Math.round(chars * 0.4)
    if (roughTokens < window * COMPACT_AT) return
    const tail = this.history.slice(-2)
    const head = this.history.slice(0, -2)
    try {
      const summary = await this.summarize(llm, head)
      this.history = [
        { role: 'user', text: `（前文自动压缩）${summary}` },
        ...tail,
      ]
      this.traced(`自动压缩：${head.length} 条 → 摘要（保留末 ${tail.length} 条）`)
      emit({ type: 'system/message', seq: 7, data: { text: `◇ 上下文接近窗口，已自动压缩历史（保留最近 ${tail.length} 条原文）。` } })
    } catch {
      // Summarization failed: keep going with the full history.
    }
  }

  /** One extra LLM call that summarizes the head of the history. */
  private async summarize(llm: LlmLike, head: readonly LoopMessage[]): Promise<string> {
    const { provider, model } = this.deps.selection()
    const transcript = head.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.text.slice(0, 4000)}`).join('\n')
    let text = ''
    const iterator = llm.stream({
      provider,
      model,
      system: '把以下对话压缩成要点摘要，保留任务目标、已做决定与关键文件/命令名，直接输出摘要。',
      messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: transcript }] }],
      maxTokens: 512,
      signal: this.abort!.signal,
    })[Symbol.asyncIterator]()
    while (true) {
      const next = await iterator.next()
      if (next.done === true) break
      const chunk = next.value as LoopChunk
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    }
    return text.trim()
  }

  /** Project the local history into wire messages (text + tool calls/results). */
  private wireMessages(): unknown[] {
    return this.history.map((m) => {
      if (m.role === 'user') {
        const blocks: unknown[] = []
        if (m.text !== '') blocks.push({ type: 'text', text: m.text })
        for (const result of m.toolResults ?? []) {
          blocks.push({ type: 'tool-result', toolCallId: result.toolCallId, content: [{ type: 'text', text: result.content }], ...(result.isError ? { isError: true } : {}) })
        }
        return {
          role: 'user',
          source: { kind: 'user' },
          content: blocks.length > 0 ? blocks : [{ type: 'text', text: m.text }],
        }
      }
      const blocks: unknown[] = []
      if (m.text !== '') blocks.push({ type: 'text', text: m.text })
      for (const call of m.toolCalls ?? []) {
        blocks.push({ type: 'tool-call', id: call.id, name: call.name, arguments: call.arguments })
      }
      return { role: 'assistant', source: { kind: 'assistant' }, content: blocks }
    })
  }
}


const MENTION_CAP_BYTES = 16 * 1024

/** Replace @path / @"path" mentions with the file's head content (A5). */
function expandMentions(text: string, workspaceRoot: string): string {
  const pattern = /@"([^"]+)"|@(\S+)/gu
  let out: string | undefined
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1] ?? match[2]
    if (raw === undefined || raw === '') continue
    const resolved = resolveWithinRoot(raw, workspaceRoot)
    if (resolved === undefined) continue
    try {
      const stat = statSync(resolved)
      if (!stat.isFile() || stat.size > 512 * 1024) continue
      const body = readFileSync(resolved, 'utf8').slice(0, MENTION_CAP_BYTES)
      const block = `\n\n<file path="${raw}">\n${body}\n</file>`
      out = (out ?? text).replace(match[0], match[0])
      if (out === text) out = text
      text = text + block
      out = text
    } catch {
      // unreadable: leave the mention as-is
    }
  }
  return out ?? text
}

function resolveWithinRoot(raw: string, root: string): string | undefined {
  const cleaned = raw.replace(/^\.\//u, '')
  const candidate = cleaned.startsWith('/')
    ? cleaned
    : join(root, cleaned)
  if (!candidate.startsWith(root)) return undefined
  return candidate
}

/** Durable sidecar: kiro-loop turns also land in .kiro/loop-log.jsonl so
 *  /chat resume can replay them (A3 — the platform log only records the
 *  platform loop's events). Rotates at SIDECAR_ROTATE_BYTES. */
function sidecarPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.kiro', 'loop-log.jsonl')
}

function appendSidecar(workspaceRoot: string, record: { at: number; event: unknown }): void {
  try {
    mkdirSync(join(workspaceRoot, '.kiro'), { recursive: true })
    const path = sidecarPath(workspaceRoot)
    try {
      const stat = statSync(path)
      if (stat.size > SIDECAR_ROTATE_BYTES) {
        renameSync(path, `${path}.1`)
      }
    } catch {
      // not present yet
    }
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
  } catch {
    // Unwritable workspace: the turn still renders; resume loses it (honest).
  }
}

/** Read the sidecar log's events (oldest first); missing file -> empty. */
export function readSidecarEvents(workspaceRoot: string): unknown[] {
  try {
    const lines = readFileSync(sidecarPath(workspaceRoot), 'utf8').split('\n')
    const out: unknown[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      try {
        out.push((JSON.parse(trimmed) as { event: unknown }).event)
      } catch {
        // torn tail line — skip
      }
    }
    return out
  } catch {
    return []
  }
}
