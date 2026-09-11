/**
 * kiro-runtime — the Ink render loop. Mounts after the loader settles,
 * creates one Agent through the core registry, binds the SessionController,
 * and renders the App.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-runtime";
/** Core services required before the TUI can mount. */
export declare const inject: string[];
/** Mount the Ink render loop. */
export declare function apply(ctx: Context): void;
