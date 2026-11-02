/**
 * Event-projection helpers (T-1 split from session-controller): pure
 * coercions and searches over session-event payloads. No state — the
 * controller orchestrates, these transform.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/event-helpers
 */
import type { Message } from './types';
/** Truncate a status-bar reason label to a single readable line. */
export declare function truncateLabel(text: string, max?: number): string;
/**
 * Find the LAST tool-call message whose record pairs with `callId`
 * (findLastIndex is not in this tsconfig's lib target).
 */
export declare function findToolCallIndex(messages: readonly Message[], callId: string): number;
/** Render-friendly preview of an arbitrary JSON value. */
export declare function previewValue(value: unknown): string;
/** Truncate a preview to a UI-friendly size. */
export declare function truncate(text: string, max?: number): string;
/** Coerce a content-block array to plain text. */
export declare function contentToText(content: readonly unknown[]): string;
