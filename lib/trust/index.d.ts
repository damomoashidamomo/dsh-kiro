/**
 * kiro-trust — placeholder plugin. Phase 3 implements the per-tool trust
 * store backed by `~/.kiro/settings/trusted-tools.json`, with interception
 * via `agent/pre-step` and the ApprovalOverlay flow.
 *
 * @module @damomoashidamomo/dsh-kiro/trust
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-trust";
/** Mount the placeholder plugin. */
export declare function apply(ctx: Context): void;
