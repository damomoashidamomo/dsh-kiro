/**
 * OptionMenu — the interactive picker for commands with enumerated arguments
 * (/engine, /loop, /tools, /spec, /skills). Same visual language as the
 * approval panel: numbered options with descriptions, ↑/↓ or number keys to
 * choose, Enter to apply, Esc to cancel. This is what the menu review asked
 * for: select the COMMAND first, then pick the OPTION from a clear menu
 * instead of reading usage text.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/OptionMenu
 */
export interface OptionItem {
    /** The argument to submit when chosen (e.g. 'kiro', 'rust', 'start'). */
    readonly value: string;
    /** Bold option label shown at the left. */
    readonly label: string;
    /** One-line explanation. */
    readonly hint: string;
}
export interface OptionMenuProps {
    /** Menu title, usually includes the current value. */
    readonly title: string;
    readonly options: readonly OptionItem[];
    readonly onPick: (value: string) => void;
    readonly onCancel: () => void;
}
export declare function OptionMenu({ title, options, onPick, onCancel }: OptionMenuProps): JSX.Element;
/**
 * Patch session titles into a picker's rows: `resume <id>` rows get the loaded
 * title, every other row is left alone. Titles load after the menu is drawn
 * (they read each session log), so this runs as a second pass.
 */
export declare function withSessionTitles(options: readonly OptionItem[], titles: ReadonlyMap<string, string>): readonly OptionItem[];
