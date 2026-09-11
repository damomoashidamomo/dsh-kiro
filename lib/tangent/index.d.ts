/**
 * kiro-tangent — placeholder plugin. Phase 5 implements the tangent mode
 * (`/tangent`, Ctrl+T) — isolated side conversations that can be merged back
 * into the main context with `/tangent tail` or selectively dropped with
 * `/tangent forget [N]`.
 *
 * @module @damomoashidamomo/dsh-kiro/tangent
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-tangent";
/** Mount the placeholder plugin. */
export declare function apply(ctx: Context): void;
