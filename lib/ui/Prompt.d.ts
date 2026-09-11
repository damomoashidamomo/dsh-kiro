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
    /** Placeholder when the draft is empty. */
    readonly placeholder?: string;
    /** Submit handler — receives the trimmed text and pending images. */
    readonly onSubmit: (text: string, images: readonly PendingImage[]) => void;
    /** Notify the parent when a special prefix is active (`/`, `@`, `!`). */
    readonly onPrefix?: (prefix: '/' | '@' | '!' | undefined) => void;
    /** Initial history to seed the buffer with. */
    readonly history?: readonly string[];
}
/** Render the prompt input row. */
export declare function Prompt({ busy, placeholder, onSubmit, onPrefix, history, }: PromptProps): JSX.Element;
