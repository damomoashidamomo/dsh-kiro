/**
 * Subcommand catalog for the option picker (Enter on a bare `/command`).
 *
 * One row per subcommand a command actually accepts, so pressing Enter on
 * `/chat` lists EVERY chat action — the hand-written picker used to show only
 * list / a few sessions / new and silently omit `delete` and `help`, and most
 * other multi-subcommand commands had no picker at all.
 *
 * `tests/subcommands.spec.ts` cross-checks this table against the `case '…'`
 * labels in each command's handler, so a new subcommand cannot be added
 * without showing up in the picker (and vice versa).
 *
 * @module @damomoashidomomo/dsh-kiro/commands/subcommands
 */
/** One selectable subcommand row. */
export interface SubcommandRow {
    /** Text appended after the command name (`resume <id>`, `dsh`, `kiro -p`). */
    readonly value: string;
    /** One-line explanation shown next to the value. */
    readonly hint: string;
    /**
     * Picking this row only PRE-FILLS the prompt (`/chat resume `) because the
     * subcommand needs further arguments; without it the row is submitted.
     */
    readonly needsArg?: boolean;
}
/** The picker for one command. */
export interface CommandPicker {
    readonly title: string;
    readonly rows: readonly SubcommandRow[];
}
/**
 * Commands that open a picker when submitted bare, and every row it offers.
 * Order is the order shown (everyday actions first, `help` last).
 */
export declare const COMMAND_PICKERS: Readonly<Record<string, CommandPicker>>;
/** Picker for `name`, or undefined when the command takes no enumerated args. */
export declare function pickerFor(name: string): CommandPicker | undefined;
/** Every command that opens a picker when submitted bare. */
export declare function pickerCommandNames(): readonly string[];
