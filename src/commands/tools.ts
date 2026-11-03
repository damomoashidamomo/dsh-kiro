/**
 * `/tools` — choose the tool EXECUTION engine for the kiro-loop:
 *   dsh  — the platform pipeline (default; sandbox + approvals inside ctx.tools)
 *   rust — the kiro-toold Rust engine: one freshly Landlock-sandboxed
 *          process per call (bash / fs_read / fs_write; everything else
 *          still goes through the platform pipeline).
 *
 * @module @damomoashidamomo/dsh-kiro/commands/tools
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const toolsCommand: CommandDefinition = {
  name: 'tools',
  description: 'Tool engine for kiro-loop: dsh (platform) | rust (Landlock)',
  input: { hint: '<dsh|rust>' },
  handler: async ({ agent, rawInput }) => {
    const ctx = (agent as { ctx?: unknown }).ctx
    const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
    const service = typeof get === 'function'
      ? get.call(ctx, 'kiroToolEngine') as { get?: () => string; set?: (next: string) => string; available?: () => boolean } | undefined
      : undefined
    if (service?.set === undefined) {
      return { kind: 'error', text: '/tools: 引擎切换服务不可用' }
    }
    const arg = rawInput.trim().toLowerCase()
    if (arg === '') {
      return {
        kind: 'success',
        text: [
          `当前工具引擎：${service.get?.() ?? '?'}（rust 可用：${service.available?.() === true ? '是' : '否——先 pnpm build:engine'}）`,
          '  /tools dsh  — DSH 平台工具管线',
          '  /tools rust — Rust 引擎（Landlock 内核级沙箱；bash/read/write 走引擎）',
          '  仅对 /loop kiro 生效；/loop dsh 始终走平台管线。',
        ].join('\n'),
      }
    }
    if (arg !== 'dsh' && arg !== 'rust') {
      return { kind: 'error', text: 'usage: /tools <dsh|rust>' }
    }
    const message = service.set(arg)
    const ok = !message.includes('未构建')
    return { kind: ok ? 'success' : 'error', text: message }
  },
}
