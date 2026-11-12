/**
 * dsh-adapter barrel + ctx 桥接小件。
 *
 * createSessionPort/createCommandPort 是给内核两个"装配点"（session-
 * controller、commands 插件）用的薄包装：它们拿到的 ctx 本身就是 cordis
 * 插件协议的一部分（SEAM 1/2，设计文档允许的耦合），这里只把服务调用收口
 * 成 Port 形状，不引入新的平台类型。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter
 */

export type {
  CommandPort, DialogAnswer, DialogApprovalOutcome, DialogApprovalRequest,
  DialogQuestion, DialogPort, DshAdapter, LlmChunk, LlmPort, LlmRequest,
  SessionPort, ToolExecResult, ToolsPort,
} from './ports'
export { createInProcessAdapter, translateLlmChunk, AnomalyCounter } from './in-process'
import { AnomalyCounter, translateLlmChunk } from './in-process'
export { createFauxLlmPort, parseFauxScript, fauxLlmFromEnv } from './faux'

/** 会话事件总线 Port（包住 ctx.on('session/event')）。 */
export function createSessionPort(
  on: (channel: 'session/event', handler: (session: unknown, event: unknown) => void) => () => void,
): import('./ports').SessionPort {
  return {
    subscribe(handler: (event: unknown) => void): () => void {
      return on('session/event', (_session, event) => { handler(event) })
    },
  }
}

/** 命令注册 Port（包住 ctx.commands.register）。 */
export function createCommandPort(
  commands: { register(command: unknown): unknown } | undefined,
): import('./ports').CommandPort {
  return {
    register(command: never): () => void {
      if (commands === undefined) return () => undefined
      const dispose = commands.register(command)
      return typeof dispose === 'function' ? (dispose as () => void) : () => undefined
    },
  }
}
export { detectPlatformVersion, evaluateGate, parseCompatOverride, compareVersions } from './version-gate'
export type { GateVerdict } from './version-gate'

/** P3.2 启动契约探针：对平台做三条最小活性检查（llm/tools 服务存在 +
 * 块翻译器工作）。任何一条失败 = 进程内适配器不可信，调用方应如实提示。 */
export function adapterHealthProbe(platform: {
  llm?: unknown
  tools?: unknown
}): { ok: boolean; problems: readonly string[] } {
  const problems: string[] = []
  if (platform.llm === undefined) problems.push('llm 服务缺失（模型回合将失败）')
  if (platform.tools === undefined) problems.push('tools 服务缺失（平台工具执行将失败）')
  try {
    const a = new AnomalyCounter()
    const out = translateLlmChunk({ type: 'text-delta', text: 'probe' }, a)
    if (out.type !== 'text-delta') problems.push('块翻译器自检失败')
  } catch {
    problems.push('块翻译器自检抛错')
  }
  return { ok: problems.length === 0, problems }
}
