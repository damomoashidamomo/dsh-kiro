/**
 * Autocomplete — a small popover that lists fuzzy-matched candidates when the
 * user types `@` or `/`. Used by both reference lookups (skills, MCP tools,
 * saved prompts) and slash-command discovery.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Autocomplete
 */
export interface AutocompleteItem {
    /** Insertion text once the user confirms (without the trigger character). */
    readonly insert: string;
    /** Display label rendered in the list. */
    readonly label: string;
    /** Optional secondary line (description, server name, …). */
    readonly hint?: string;
    /** Searchable extra tokens. */
    readonly keywords?: readonly string[];
}
export interface AutocompleteProps {
    /** Trigger character: '/' or '@'. */
    readonly trigger: '/' | '@';
    /** Current query (without the trigger character). */
    readonly query: string;
    /** Candidate pool. */
    readonly candidates: readonly AutocompleteItem[];
    /** Index of the currently highlighted candidate. */
    readonly selected: number;
    /** Maximum number of candidates to render. */
    readonly maxVisible?: number;
}
/** Render the autocomplete popover. */
export declare function Autocomplete({ trigger, query, candidates, selected, maxVisible }: AutocompleteProps): JSX.Element;
/** Built-in slash-command candidate list (all 25 shipped commands). */
export declare function slashCandidates(items: ReadonlyArray<{
    name: string;
    description: string;
}>): AutocompleteItem[];
