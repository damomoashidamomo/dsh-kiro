/**
 * in-process 适配器实现（主）：把内核 Port 调用翻译成当前 DSH 平台协议。
 *
 * 这里是全项目**唯一**合法 import `@deepseek-ai/*` 运行时形状的地方（类型
 * 经结构转型获取，不新增运行时依赖）。所有翻译都必须容错：
 * - 平台块 → 内核块：未知 type 记入 anomalies（可见化，禁止静默丢）；
 * - 字段缺失 → 安全缺省 + 计数；
 * - 平台服务缺失 → Port 返回 undefined 语义由调用方降级（与现状一致）。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/in-process
 */

import type {
  DialogAnswer,
  ToolsPort,
  DialogApprovalOutcome,
  DialogApprovalRequest,
  DialogQuestion,
  DshAdapter,
  LlmChunk,
  LlmRequest,
  ToolExecResult,
} from './ports'

/** 容错遥测收集器。 */
export class AnomalyCounter {
  private readonly counts = new Map<string, number>()

  bump(kind: string): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1)
  }

  count(kind: string): number {
    return this.counts.get(kind) ?? 0
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counts)
  }
}

/** 平台 llm 流块的宽松形状（结构转型，不做类型断言）。 */
type PlatformChunk = { type?: unknown } & Record<string, unknown>

/** 把一个平台块翻译为内核块；无法识别的记入 anomalies 并返回 unknown 块。 */
export function translateLlmChunk(raw: unknown, anomalies: AnomalyCounter): LlmChunk {
  if (typeof raw !== 'object' || raw === null) {
    anomalies.bump('llm:non-object-chunk')
    return { type: 'unknown', rawType: String((raw as { type?: unknown })?.type ?? 'non-object') }
  }
  const chunk = raw as PlatformChunk
  const type = typeof chunk.type === 'string' ? chunk.type : ''
  const textOf = (key: string): string => (typeof chunk[key] === 'string' ? chunk[key] as string : '')
  switch (type) {
    case 'text-delta':
      return { type: 'text-delta', text: textOf('text') }
    case 'reasoning-delta':
      return { type: 'reasoning-delta', text: textOf('text') }
    case 'block-end': {
      // 工具调用块：block.type 为 'tool-call'（平台拼写容错：tool_use/tool-call）。
      const block = (typeof chunk.block === 'object' && chunk.block !== null ? chunk.block : {}) as Record<string, unknown>
      const blockType = typeof block.type === 'string' ? block.type : ''
      if (blockType === 'tool-call' || blockType === 'tool_use' || blockType === 'toolCall') {
        const id = typeof block.id === 'string' ? block.id : ''
        const name = typeof block.name === 'string' ? block.name : ''
        const args = typeof block.arguments === 'string' ? block.arguments : JSON.stringify(block.arguments ?? {})
        return { type: 'tool-call', id, name, arguments: args }
      }
      if (blockType === 'text' || blockType === 'reasoning') {
        // 文本/思考块的 block-end：无内核语义，安全忽略（不计异常）。
        return { type: 'unknown', rawType: `block-end:${blockType}` }
      }
      anomalies.bump(`llm:block-end-unknown:${blockType || 'missing'}`)
      return { type: 'unknown', rawType: `block-end:${blockType || 'missing'}` }
    }
    case 'usage': {
      const usage = (typeof chunk.usage === 'object' && chunk.usage !== null ? chunk.usage : {}) as Record<string, unknown>
      const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
      return {
        type: 'usage',
        inputTokens: num(usage.inputTokens),
        outputTokens: num(usage.outputTokens),
        totalTokens: num(usage.totalTokens),
      }
    }
    case 'finish': {
      const reason = (typeof chunk.reason === 'object' && chunk.reason !== null ? chunk.reason : {}) as Record<string, unknown>
      const failure = (typeof reason.failure === 'object' && reason.failure !== null ? reason.failure : {}) as Record<string, unknown>
      return {
        type: 'finish',
        reason: typeof reason.kind === 'string' ? reason.kind : 'stop',
        ...(typeof failure.message === 'string' && failure.message !== '' ? { failureMessage: failure.message } : {}),
      }
    }
    default:
      anomalies.bump(`llm:unknown-type:${type || 'missing'}`)
      return { type: 'unknown', rawType: type || 'missing' }
  }
}

/**
 * 组装 in-process 适配器。所有平台形状只在本函数闭包内出现。
 * 服务缺失时对应 Port 方法如实抛错/返回空——由内核按现状降级。
 */
export function createInProcessAdapter(platform: {
  llm?: { stream(options: unknown): AsyncIterable<unknown> }
  tools?: {
    schemas(): { name: string }[]
    register(def: unknown): () => void
    execute(exec: unknown): Promise<unknown>
  }
  userQuestions?: { ask(request: unknown): Promise<{ answers: DialogAnswer[] }> }
  approval?: (request: DialogApprovalRequest) => Promise<DialogApprovalOutcome>
  onSessionEvent?: (handler: (event: unknown) => void) => () => void
  onCommand?: (command: unknown) => () => void
}): DshAdapter {
  const anomalies = new AnomalyCounter()

  const llm = {
    stream(request: LlmRequest): AsyncIterable<LlmChunk> {
      const upstream = platform.llm
      if (upstream === undefined) {
        async function* empty(): AsyncIterable<LlmChunk> {
          throw new Error('dsh-adapter: llm 服务不可用（平台未提供）')
        }
        return empty()
      }
      // 翻译请求：内核形状 → 平台当前协议（与 kiro-loop 原生组装一致）。
      const options = {
        provider: request.provider,
        model: request.model,
        ...(request.reasoningEffort !== undefined ? { reasoningEffort: request.reasoningEffort } : {}),
        system: request.system,
        ...(request.tools !== undefined && request.tools.length > 0 ? { tools: request.tools } : {}),
        messages: request.messages,
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      }
      async function* translated(): AsyncIterable<LlmChunk> {
        for await (const raw of upstream!.stream(options)) {
          yield translateLlmChunk(raw, anomalies)
        }
      }
      return translated()
    },
  }

  const tools: ToolsPort = {
    schemas(): { name: string }[] {
      if (platform.tools === undefined) return []
      try {
        return platform.tools.schemas()
      } catch {
        anomalies.bump('tools:schemas-failed')
        return []
      }
    },
    register(def: Parameters<ToolsPort['register']>[0]): () => void {
      if (platform.tools === undefined) return () => undefined
      try {
        return platform.tools.register(def)
      } catch {
        anomalies.bump('tools:register-failed')
        return () => undefined
      }
    },
    async execute(exec: Parameters<ToolsPort['execute']>[0]): Promise<ToolExecResult> {
      if (platform.tools === undefined) {
        return { isError: true, content: [{ type: 'text', text: 'tool runtime unavailable' }] }
      }
      try {
        const raw = (await platform.tools.execute(exec)) as ToolExecResult
        return {
          isError: raw?.isError === true,
          content: Array.isArray(raw?.content) ? raw.content : [],
          ...(raw?.value !== undefined ? { value: raw.value } : {}),
          ...(raw?.error !== undefined ? { error: raw.error } : {}),
        }
      } catch (error) {
        anomalies.bump('tools:execute-threw')
        return { isError: true, content: [{ type: 'text', text: `tool error: ${error instanceof Error ? error.message : String(error)}` }] }
      }
    },
  }

  const dialog = {
    async askQuestions(request: { questions: readonly DialogQuestion[]; signal?: AbortSignal }): Promise<{ answers: readonly DialogAnswer[] }> {
      if (platform.userQuestions?.ask === undefined) {
        throw new Error('dsh-adapter: userQuestions 服务不可用')
      }
      return platform.userQuestions.ask(request)
    },
    async requestApproval(request: DialogApprovalRequest): Promise<DialogApprovalOutcome> {
      if (platform.approval === undefined) {
        // 平台无审批通道：fail-closed（宁可拒也不能静默放行）。
        anomalies.bump('dialog:approval-unavailable')
        return 'rejected'
      }
      return platform.approval(request)
    },
  }

  const session = {
    subscribe(handler: (event: unknown) => void): () => void {
      if (platform.onSessionEvent === undefined) {
        anomalies.bump('session:bus-unavailable')
        return () => undefined
      }
      return platform.onSessionEvent(handler)
    },
  }

  const commands = {
    register(command: Parameters<NonNullable<DshAdapter['commands']['register']>>[0]): () => void {
      if (platform.onCommand === undefined) {
        anomalies.bump('commands:register-unavailable')
        return () => undefined
      }
      return platform.onCommand(command)
    },
  }

  return { llm, tools, dialog, session, commands, anomalies }
}
