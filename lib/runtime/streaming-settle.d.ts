/**
 * Streaming settle logic (T-1 split from session-controller): decide how much
 * of a streaming answer can be frozen into Ink's `<Static>` (printed once,
 * never rewritten) while the unfinished tail stays in the live region.
 *
 * Pure module: text in, boundaries out.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/streaming-settle
 */
/**
 * Find the offset just past the LAST safe line boundary for settling a
 * streaming answer into `<Static>` pieces. A boundary is unsafe when:
 * - it would cut inside a fenced code block (``` / ~~~ unbalanced),
 * - either adjacent line contains `|` (GFM table rows must stay together),
 * - the next line is a fenced opener or a setext underline (=== / ---),
 * - there would be no non-empty tail left to keep streaming.
 * Returns -1 when nothing can be settled yet.
 */
export declare function settleCut(text: string): number;
/**
 * The settled piece's display text: the slice past the previous settle
 * point up to (and including) the boundary newline, with that trailing
 * newline dropped — a piece is its own markdown block.
 */
export declare function settlePieceText(full: string, settledUpTo: number, cut: number): string;
