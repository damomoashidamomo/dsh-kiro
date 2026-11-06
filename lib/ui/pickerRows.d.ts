/**
 * Row building for the option pickers — pure helpers so the ordering and the
 * height budget can be unit-tested without rendering Ink.
 *
 * @module @damomoashidomomo/dsh-kiro/ui/pickerRows
 */
import type { OptionItem } from './OptionMenu';
import type { SubcommandRow } from '../commands/subcommands';
/** One saved session as the picker sees it. */
export interface PickerSession {
    readonly id: string;
    readonly title: string;
    /** Timestamp shown until (or instead of) the title. */
    readonly when: string;
}
/**
 * Build the `/chat` picker rows.
 *
 * Order: the static subcommands with the concrete sessions right after
 * `resume <id>` (they ARE the resume targets), and `help` last. The `list`
 * row carries the total so a truncated menu still tells the user how to see
 * everything.
 *
 * `maxSessions` is the terminal-height budget: the menu is windowed by
 * OptionMenu, but trimming here keeps the row count predictable.
 */
export declare function chatPickerRows(subcommands: readonly SubcommandRow[], sessions: readonly PickerSession[], total: number, maxSessions: number): readonly OptionItem[];
/**
 * How many session rows fit: leave room for the border, the title, the footer
 * and the static subcommands, and never offer fewer than four (a menu that
 * cannot list four sessions is useless — scrolling covers the rest).
 */
export declare function sessionRowBudget(terminalRows: number | undefined, staticRows: number): number;
