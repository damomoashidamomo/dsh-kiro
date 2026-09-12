/**
 * Transcript — the scrollable log of past messages. Uses Ink's `Static`
 * component so messages stay rendered once written; the in-flight streaming
 * message lives outside Static so it can be mutated cheaply.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Transcript
 */
import type { Message as MessageRecord } from '../runtime/types';
/** Sticky banner rendered once at the top of the transcript. */
export interface SplashItem {
    readonly kind: 'splash';
    readonly key: string;
    readonly content: string;
}
export interface TranscriptProps {
    /** All rendered messages. */
    messages: readonly MessageRecord[];
    /** Optional sticky header rendered once above the messages (e.g. the splash banner). */
    header?: SplashItem;
}
/**
 * Render the transcript. Static optimizes finished messages so re-renders on
 * streaming updates stay cheap. The current live message stays outside Static
 * by appending to the array only after the message completes.
 *
 * NOTE: Ink keeps a single `staticNode` reference on the root, so the whole
 * app may only mount ONE `<Static>` subtree. The splash banner is therefore
 * passed in as a `header` item here instead of rendering its own `<Static>`.
 */
export declare function Transcript({ messages, header }: TranscriptProps): JSX.Element;
