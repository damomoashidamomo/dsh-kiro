/**
 * dsh-adapter — dsh-kiro 内核与 DSH 平台之间的**唯一**接触面。
 *
 * 设计定稿见 `docs/design/kernel-adapter.zh.md`。五条规则：
 *
 * 1. 内核代码（src/runtime|ui|commands|utils|skills|trust|…）**禁止** import
 *    `@deepseek-ai/*`——只允许 import 本目录（lint 强制）；
 * 2. Port 是**数据面**：类型全部是内核自有定义，DSH 协议形状只活在
 *    in-process 实现里，并在那里做容错翻译（未知块可见化，禁止静默丢）；
 * 3. Port 无安全决策权：审批/放行永远在内核；
 * 4. 每个 Port 有 in-process 实现（主）与备用实现的插槽（降级逃生舱）；
 * 5. 本文件不 import 任何 @deepseek-ai 包——它是内核可见的纯类型层。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/ports
 */

// ─── ① LlmPort ─────────────────────────────────────────────────────────────

/** 内核自有：模型流块。字段由 tolerant 解析器从平台块翻译而来。 */
export type LlmChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: 'finish'; reason: string; failureMessage?: string }
  | { type: 'unknown'; rawType: string }

/** 一次模型请求（内核自有形状；in-process 实现负责翻译为平台协议）。 */
export interface LlmRequest {
  provider: string
  model: string
  system: string
  messages: readonly unknown[]
  tools?: readonly { name: string }[]
  reasoningEffort?: string
  signal?: AbortSignal
}

/** 模型流端口。 */
export interface LlmPort {
  stream(request: LlmRequest): AsyncIterable<LlmChunk>
}

// ─── ② ToolsPort ───────────────────────────────────────────────────────────

/** 工具执行结果（内核自有形状）。 */
export interface ToolExecResult {
  isError: boolean
  content: readonly { type: string; text?: string }[]
  value?: unknown
  error?: { message?: string }
}

/** 工具端口：注册（模型可见 schema）+ 执行（非内核引擎工具走平台）。 */
export interface ToolsPort {
  schemas(): { name: string }[]
  register(def: {
    name: string
    description: string
    parameters: Record<string, unknown>
    output?: { schema?: Record<string, unknown>; render?: (args: unknown, value: unknown) => unknown }
    execute: (args: unknown, extra?: unknown) => Promise<unknown>
  }): () => void
  execute(exec: { callId: string; name: string; arguments: unknown; agent?: unknown; signal: AbortSignal }): Promise<ToolExecResult>
}

// ─── ③ DialogPort ──────────────────────────────────────────────────────────

/** 内核自有：一页问题。 */
export interface DialogQuestion {
  readonly id: string
  readonly header?: string
  readonly question: string
  readonly detail?: string
  readonly options?: readonly { label: string; description?: string }[]
}

/** 内核自有：问题答案。 */
export interface DialogAnswer {
  readonly id: string
  readonly selected: readonly string[]
  readonly custom?: string
}

/** 内核自有：审批请求与结果。 */
export interface DialogApprovalRequest {
  readonly toolName: string
  readonly reason?: string
  readonly command?: string
  readonly signal?: AbortSignal
}

export type DialogApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled'

/** 对话端口：结构化问答 + 工具审批（面板由内核渲染，答案经此回流）。 */
export interface DialogPort {
  askQuestions(request: { questions: readonly DialogQuestion[]; signal?: AbortSignal }): Promise<{ answers: readonly DialogAnswer[] }>
  requestApproval(request: DialogApprovalRequest): Promise<DialogApprovalOutcome>
}

// ─── ④ SessionPort ─────────────────────────────────────────────────────────

/** 内核自有：会话事件（opaque——内核只透传给自己的投影层）。 */
export interface SessionPort {
  /** 订阅会话事件总线；返回退订函数。 */
  subscribe(handler: (event: unknown) => void): () => void
}

// ─── ⑤ CommandPort ─────────────────────────────────────────────────────────

/** 命令端口：斜杠命令注册。 */
export interface CommandPort {
  register(command: {
    name: string
    description: string
    input?: { hint?: string }
    handler: (args: { agent: unknown; rawInput: string }) => Promise<{ kind: 'success' | 'error'; text: string }>
  }): () => void
}

// ─── 适配器聚合 ─────────────────────────────────────────────────────────────

/** 全部五个端口的聚合。 */
export interface DshAdapter {
  readonly llm: LlmPort
  readonly tools: ToolsPort
  readonly dialog: DialogPort
  readonly session: SessionPort
  readonly commands: CommandPort
  /** 容错遥测：未知/异常协议块计数（P2 可见化）。 */
  readonly anomalies: { count(kind: string): number; snapshot(): Record<string, number> }
}
