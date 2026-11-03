/**
 * `/loop` — choose the turn driver: `dsh` (the platform's dsh-agent-loop,
 * full tools) or `kiro` (dsh-kiro's own driver; P1 = text-only chat, tools
 * land with the Rust engine). The transcript and approvals UI are shared;
 * only the turn engine differs.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/loop
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const loopCommand: CommandDefinition = {
  name: 'loop',
  description: 'Turn driver: dsh (platform) | kiro (own, P1 text-only)',
  input: { hint: '<dsh|kiro>' },
  handler: async ({ agent, rawInput }) => {
    const ctx = (agent as { ctx?: unknown }).ctx
    const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
    const service = typeof get === 'function'
      ? get.call(ctx, 'kiroLoopMode') as { get?: () => string; set?: (next: string) => string } | undefined
      : undefined
    if (service?.set === undefined) {
      return { kind: 'error', text: '/loop: loop 模式服务不可用' }
    }
    const arg = rawInput.trim().toLowerCase()
    if (arg === '') {
      return {
        kind: 'success',
        text: [
          `当前 loop：${service.get?.() ?? '?'}`,
          '  /loop dsh  — DSH 平台 agent loop（完整工具链）',
          '  /loop kiro — dsh-kiro 自研驱动（P1：纯对话，工具待 Rust 引擎接入）',
        ].join('\n'),
      }
    }
    if (arg !== 'dsh' && arg !== 'kiro') {
      return { kind: 'error', text: 'usage: /loop <dsh|kiro>' }
    }
    return { kind: 'success', text: service.set(arg) }
  },
}
