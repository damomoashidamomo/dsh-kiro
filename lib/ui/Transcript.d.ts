/**
 * Transcript — the scrollable log of past messages. Uses Ink's `Static`
 * component so messages stay rendered once written; the in-flight streaming
 * message lives outside Static so it can be mutated cheaply.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Transcript
 */
import type { Message as MessageRecord } from '../runtime/types';
export interface TranscriptProps {
    /** All rendered messages. */
    messages: readonly MessageRecord[];
}
/**
 * Render the transcript. Static optimizes finished messages so re-renders on
 * streaming updates stay cheap. The current live message stays outside Static
 * by appending to the array only after the message completes.
 */
export declare function Transcript({ messages }: TranscriptProps): JSX.Element;
