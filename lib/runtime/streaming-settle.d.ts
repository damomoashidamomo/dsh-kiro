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
/** Terminal rows `text` occupies after markdown-ish wrapping. */
export declare function estimateRows(text: string, columns: number): number;
/**
 * Wall-of-text guard: a model that streams ONE unbroken line (no newline at
 * all) keeps the whole answer in Ink's live region, so the region grows to a
 * full screen of text that only ever exists on screen — never in the
 * scrollback. `settleCut` cannot help (there is no boundary to cut at) and
 * cutting without a newline is only safe for plain paragraphs, which is
 * exactly what this guard targets: fenced code and tables always carry
 * newlines, so they are left to `settleCut`.
 *
 * Returns the offset to settle up to, or -1 when the tail is already small
 * enough or is line-structured (not this guard's job).
 */
export declare function wallCut(text: string, settledUpTo: number, maxRows: number, columns: number): number;
