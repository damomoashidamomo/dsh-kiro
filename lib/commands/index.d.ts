/**
 * kiro-commands — register every slash command from the dsh-kiro catalog.
 *
 * Commands registered here are global (the TUI is single-session), so a host
 * row in the patch is the right place. Phase 3 will fill in real handlers;
 * today each unknown one returns a polite "phase 3+" stub via `stubCommand`.
 *
 * @module @damomoashidamomo/dsh-kiro/commands
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-commands";
/** Core services required for slash dispatch. */
export declare const inject: string[];
/** Register every slash command. */
export declare function apply(ctx: Context): void;
