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
//# sourceMappingURL=streaming-settle.js.map