/**
 * kiro-checkpoint — exposes a CheckpointManager on the Cordis context so the
 * runtime can take a snapshot after every turn and `/checkpoint` can drive
 * restore/diff operations.
 *
 * @module @damomoashidamomo/dsh-kiro/checkpoint
 */
import type { Context } from '@deepseek-ai/cordis';
/** Service identifier for the loaded checkpoint manager. */
export declare const KIRO_CHECKPOINT = "kiroCheckpoint";
/** Stable Cordis plugin name. */
export declare const name = "kiro-checkpoint";
/** Mount the checkpoint manager. */
export declare function apply(ctx: Context): void;
export { CheckpointManager } from './manager';
export type { Checkpoint } from './manager';
