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
    readonly expandTools?: boolean;
    /** All rendered messages. */
    messages: readonly MessageRecord[];
    /** Optional sticky header rendered once above the messages (e.g. the splash banner). */
    header?: SplashItem;
}
export declare function Transcript({ messages, header, expandTools }: TranscriptProps): JSX.Element;
