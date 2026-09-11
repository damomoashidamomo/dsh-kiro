/**
 * kiro-checkpoint — placeholder plugin. Phase 5 implements a git shadow repo
 * under `.kiro/checkpoints/` and the `/checkpoint init|list|expand|diff|
 * restore|clean` workflow.
 *
 * @module @damomoashidamomo/dsh-kiro/checkpoint
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-checkpoint";
/** Mount the placeholder plugin. */
export declare function apply(ctx: Context): void;
