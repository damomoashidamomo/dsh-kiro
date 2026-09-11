/**
 * kiro-commands — register every slash command from the dsh-kiro catalog.
 *
 * Commands registered here are global (the TUI is single-session), so a host
 * row in the patch is the right place. dsh-base rows that already own a name
 * (`/plan` from dsh-plan-mode, `/compact` from dsh-command-compact) keep it:
 * those are real implementations wired into the session machinery, while the
 * kiro catalog entries for the same names are phase-3 stubs. Everything else
 * in the catalog is registered here.
 *
 * @module @damomoashidamomo/dsh-kiro/commands
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-commands";
/** Core services required for slash dispatch. */
export declare const inject: string[];
/** Register every slash command whose name is not owned by the base layer. */
export declare function apply(ctx: Context): void;
