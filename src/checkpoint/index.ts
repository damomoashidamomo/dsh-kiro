/**
 * kiro-checkpoint — exposes a CheckpointManager on the Cordis context so the
 * runtime can take a snapshot after every turn and `/checkpoint` can drive
 * restore/diff operations.
 *
 * @module @damomoashidamomo/dsh-kiro/checkpoint
 */

import type { Context } from '@deepseek-ai/cordis'
import { CheckpointManager } from './manager'

/** Service identifier for the loaded checkpoint manager. */
export const KIRO_CHECKPOINT = 'kiroCheckpoint'

/** Stable Cordis plugin name. */
export const name = 'kiro-checkpoint'

/** Mount the checkpoint manager. */
export function apply(ctx: Context): void {
  const manager = new CheckpointManager(process.cwd())
  ctx.provide(KIRO_CHECKPOINT, manager)
  // Direct instance stash: ctx.get through other scopes hands out a shadow
  // proxy whose detached methods lose `this` (the sessionQuery/llm trap) —
  // the runtime's auto-snapshot hook reads this instead.
  ;(globalThis as { __kiroCheckpointManager?: CheckpointManager }).__kiroCheckpointManager = manager
  ctx.logger.info?.(`dsh-kiro: kiro-checkpoint mounted (shadow=${manager.shadowDir})`)
}

export { CheckpointManager } from './manager'
export type { Checkpoint } from './manager'
