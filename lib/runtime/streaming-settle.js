/**
 * Streaming settle logic (T-1 split from session-controller): decide how much
 * of a streaming answer can be frozen into Ink's `<Static>` (printed once,
 * never rewritten) while the unfinished tail stays in the live region.
 *
 * Pure module: text in, boundaries out.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/streaming-settle
 */
import { displayWidth } from "../markdown/render.js";
/**
 * Find the offset just past the LAST safe line boundary for settling a
 * streaming answer into `<Static>` pieces. A boundary is unsafe when:
 * - it would cut inside a fenced code block (``` / ~~~ unbalanced),
 * - either adjacent line contains `|` (GFM table rows must stay together),
 * - the next line is a fenced opener or a setext underline (=== / ---),
 * - there would be no non-empty tail left to keep streaming.
 * Returns -1 when nothing can be settled yet.
 */
export function settleCut(text) {
    if (!text.includes('\n'))
        return -1;
    const lines = text.split('\n');
    let offset = 0;
    let fenceOpen = false;
    let cut = -1;
    for (let i = 0; i < lines.length - 1; i += 1) {
        const line = lines[i] ?? '';
        const next = lines[i + 1] ?? '';
        if (/^\s*(```|~~~)/u.test(line))
            fenceOpen = !fenceOpen;
        offset += line.length + 1;
        if (fenceOpen)
            continue;
        if (offset >= text.length)
            continue;
        if (line.includes('|') || next.includes('|'))
            continue;
        if (/^\s{0,3}(={2,}|-{2,})\s*$/u.test(next))
            continue;
        cut = offset;
    }
    return cut;
}
/**
 * The settled piece's display text: the slice past the previous settle
 * point up to (and including) the boundary newline, with that trailing
 * newline dropped — a piece is its own markdown block.
 */
export function settlePieceText(full, settledUpTo, cut) {
    return full.slice(settledUpTo, cut).replace(/\n$/u, '');
}
/** Terminal rows `text` occupies after markdown-ish wrapping. */
export function estimateRows(text, columns) {
    const cols = Math.max(20, columns);
    let rows = 0;
    for (const line of text.split('\n')) {
        rows += Math.max(1, Math.ceil(displayWidth(line) / cols));
    }
    return rows;
}
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
export function wallCut(text, settledUpTo, maxRows, columns) {
    const tail = text.slice(settledUpTo);
    if (tail.includes('\n'))
        return -1;
    const cols = Math.max(20, columns);
    if (estimateRows(tail, cols) <= maxRows)
        return -1;
    // Never settle past the end of the tail: an offset beyond `text.length`
    // would advance `settledUpTo` while the emitted piece is clamped short,
    // and the next piece would then start INSIDE already-shown text
    // (duplicated words on screen).
    const limit = Math.min(tail.length, Math.max(40, maxRows * cols));
    const slice = tail.slice(0, limit);
    // Prefer a word boundary near the limit so the piece reads as a paragraph.
    const space = slice.lastIndexOf(' ');
    const at = space > limit * 0.5 ? space + 1 : limit;
    return settledUpTo + at;
}
//# sourceMappingURL=streaming-settle.js.map