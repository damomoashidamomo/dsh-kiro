/**
 * `/undo` — restore the workspace to the checkpoint BEFORE the last one
 * (undo the last turn's changes). The auto-snapshot at every turn end means
 * snapshot N is taken AFTER turn N, so undo restores N-1. Requires the
 * shadow repo (/checkpoint init); confirmation is explicit: prints the plan
 * and requires /undo confirm.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/undo
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

interface CheckpointSvc {
  isInitialized(): boolean
  list(): readonly { id: number; label: string; shortHash: string; createdAt: number }[]
  restore(id: number): unknown
}

export const undoCommand: CommandDefinition = {
  name: 'undo',
  description: 'Undo the last turn: restore the previous checkpoint (confirm-first)',
  input: { hint: '[confirm]' },
  handler: async ({ agent, rawInput }) => {
    const ctx = (agent as { ctx?: unknown }).ctx
    const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
    const svc = ((globalThis as { __kiroCheckpointManager?: CheckpointSvc }).__kiroCheckpointManager
      ?? get?.call(ctx, 'kiroCheckpoint')) as CheckpointSvc | undefined
    if (svc === undefined || svc.isInitialized?.() !== true) {
      return { kind: 'error', text: '/undo: 未初始化 checkpoint（先 /checkpoint init）。' }
    }
    const confirm = rawInput.trim() === 'confirm'
    const list = svc.list()
    if (list.length < 2) {
      return { kind: 'error', text: `/undo: 需要至少 2 个 checkpoint（当前 ${list.length}）——先跑一两个回合。` }
    }
    const target = list[list.length - 2]!
    if (!confirm) {
      return {
        kind: 'success',
        text: [
          `将把工作区恢复到 checkpoint #${String(target.id)}（${target.shortHash}${target.label !== '' ? ` · ${target.label}` : ''}），`,
          '撤销之后的所有改动（包括未提交的工作）。此操作不可逆。',
          '确认执行：/undo confirm',
        ].join('\n'),
      }
    }
    svc.restore(target.id)
    return { kind: 'success', text: `✓ 已恢复到 checkpoint #${String(target.id)}（${target.shortHash}）。` }
  },
}
