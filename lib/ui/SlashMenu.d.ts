/**
 * SlashMenu — Ctrl+K overlay that fuzzy-searches the entire slash-command
 * registry. Renders groups of commands; arrow-key navigation picks one and
 * Enter dispatches it as if the user had typed it.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/SlashMenu
 */
export interface SlashMenuProps {
    /** Initial query — usually the partial `/foo` the user already typed. */
    readonly initialQuery: string;
    /** Whether the menu is open. */
    readonly active: boolean;
    /** Close without dispatching. */
    readonly onClose: () => void;
    /** Dispatch the chosen command (write the chosen `/name …` to the prompt). */
    readonly onSelect: (text: string) => void;
}
/** Render the slash-command palette. */
export declare function SlashMenu({ initialQuery, active, onClose, onSelect }: SlashMenuProps): JSX.Element | null;
