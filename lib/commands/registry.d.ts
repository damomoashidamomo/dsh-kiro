/**
 * Slash command registry facade. The actual command registrations live in
 * their own files; this module gathers them, exposes a discoverable catalog
 * for the slash menu, and provides the dispatch entry point.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/registry
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/** Catalog of all slash commands shipped with dsh-kiro. */
export declare const ALL_COMMANDS: readonly CommandDefinition[];
/** Grouping for the slash-menu rendering. */
export interface CommandGroup {
    readonly title: string;
    readonly items: readonly CommandDefinition[];
}
/** Group commands by surface for the slash menu. */
export declare function groupCommands(): readonly CommandGroup[];
/** Look up a command by name (case-insensitive). */
export declare function findCommand(name: string): CommandDefinition | undefined;
