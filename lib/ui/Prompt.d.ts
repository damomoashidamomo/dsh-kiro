/**
 * Prompt — the multi-line input row at the bottom of the screen.
 *
 * Uses Ink's `useInput` to capture keystrokes and feeds them into the
 * framework-agnostic PromptBuffer (see `runtime/input.ts`). The visual layer
 * is intentionally plain: an `>` gutter in the accent color, the draft text,
 * and a placeholder when empty.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Prompt
 */
import { type PendingImage } from '../runtime/input';
export interface PromptProps {
    /** Whether the agent is currently processing a turn. */
    readonly busy: boolean;
    /** Context usage percent (0-100) rendered left of the gutter, kiro-style. */
    readonly contextPct?: number;
    /** True while contextPct is a replay-based estimate (resumed session). */
    readonly contextApprox?: boolean;
    /** Placeholder when the draft is empty. */
    readonly placeholder?: string;
    /** Submit handler — receives the trimmed text and pending images. */
    readonly onSubmit: (text: string, images: readonly PendingImage[]) => void;
    /**
     * Enter on an EMPTY prompt (no draft, no pending image) — the shell-like
     * blank line. Without it the key silently does nothing.
     */
    readonly onEmptySubmit?: () => void;
    /** Notify the parent when a special prefix is active (`/`, `@`, `!`). */
    readonly onPrefix?: (prefix: '/' | '@' | '!' | undefined, query: string) => void;
    /** Initial history to seed the buffer with. */
    readonly history?: readonly string[];
    /** Move the autocomplete highlight by `delta` (typically ±1 on arrow keys). */
    readonly onAutocompleteMove?: (delta: number) => void;
    /** Commit the currently highlighted autocomplete entry. */
    readonly onAutocompleteCommit?: () => void;
    /**
     * Insert a picked `@`-mention into the draft (path completion): the
     * trailing query token is replaced by `insert` plus a space. Bumping the
     * seq applies it once; the same seq is ignored.
     */
    /** Drop the blank row above the prompt (an echoed prompt line precedes it). */
    readonly tightTop?: boolean;
    readonly pendingInsert?: {
        readonly token: string;
        readonly insert: string;
        readonly seq: number;
        readonly clearAll?: boolean;
        /** Replace the whole draft with this text (picker pre-fill). */
        readonly replace?: string;
    } | undefined;
    /**
     * An autocomplete popup is open: Enter commits the highlighted entry
     * instead of submitting the draft (kiro-style).
     */
    readonly autocompleteActive?: boolean;
    /**
     * True while an autocomplete popup renders BELOW the prompt: the real
     * caret must not be positioned then (the jump targets the frame's last
     * line, which is the popup's border, and the cursor would sit there).
     */
    readonly popupOpen?: boolean;
}
/** Render the prompt input row. */
export declare function Prompt({ busy, contextPct, contextApprox, popupOpen, placeholder, onSubmit, onEmptySubmit, onPrefix, history, onAutocompleteMove, onAutocompleteCommit, pendingInsert, tightTop, autocompleteActive, }: PromptProps): JSX.Element;
