/**
 * dsh-kiro prompt input — a thin multi-line buffer that:
 *   - tracks a primary draft + an ordered history of submitted prompts,
 *   - keeps a cursor with left/right word jumps and home/end,
 *   - detects special prefixes (`/`, `@`, `!`) for the renderer to route,
 *   - records pending images that arrived via paste,
 *   - never touches stdin directly — the Ink `useInput` hook drives it.
 *
 * Keeping the buffer logic framework-agnostic makes it easy to unit-test the
 * prefix detection and the cursor math without booting React.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/input
 */
/** Construct a fresh empty buffer. */
export function emptyBuffer(history = []) {
    return {
        text: '',
        cursor: 0,
        history,
        historyIndex: -1,
        images: [],
    };
}
/** Detect whether the draft starts with a special trigger character. */
export function detectPrefix(text) {
    if (text.startsWith('!'))
        return '!';
    if (text.startsWith('/'))
        return '/';
    if (text.startsWith('@'))
        return '@';
    return undefined;
}
/** Move the cursor one word to the left. */
function prevWord(text, cursor) {
    if (cursor === 0)
        return 0;
    let i = cursor - 1;
    // Skip whitespace backwards.
    while (i > 0 && /\s/u.test(text[i] ?? ''))
        i -= 1;
    // Skip word backwards.
    while (i > 0 && !/\s/u.test(text[i - 1] ?? ''))
        i -= 1;
    return i;
}
/** Move the cursor one word to the right. */
function nextWord(text, cursor) {
    const len = text.length;
    if (cursor >= len)
        return len;
    let i = cursor;
    // Skip whitespace forwards.
    while (i < len && /\s/u.test(text[i] ?? ''))
        i += 1;
    // Skip word forwards.
    while (i < len && !/\s/u.test(text[i] ?? ''))
        i += 1;
    return i;
}
/** Apply one keystroke outcome to the buffer; returns a new buffer. */
export function applyOutcome(buffer, outcome) {
    switch (outcome.kind) {
        case 'ignore':
            return buffer;
        case 'submit': {
            const text = buffer.text.trim();
            if (text === '' && buffer.images.length === 0)
                return buffer;
            const history = buffer.historyIndex === -1
                ? [...buffer.history, text]
                : buffer.history;
            return emptyBuffer(history);
        }
        case 'history-prev':
            return stepHistory(buffer, +1);
        case 'history-next':
            return stepHistory(buffer, -1);
        case 'auto-complete':
            // Renderer handles auto-complete by mutating the buffer text directly.
            return buffer;
        case 'newline':
            return { ...buffer, text: insertAt(buffer.text, buffer.cursor, '\n'), cursor: buffer.cursor + 1 };
        case 'backspace':
            if (buffer.cursor === 0)
                return buffer;
            return {
                ...buffer,
                text: buffer.text.slice(0, buffer.cursor - 1) + buffer.text.slice(buffer.cursor),
                cursor: buffer.cursor - 1,
            };
        case 'delete':
            if (buffer.cursor >= buffer.text.length)
                return buffer;
            return {
                ...buffer,
                text: buffer.text.slice(0, buffer.cursor) + buffer.text.slice(buffer.cursor + 1),
            };
        case 'cursor-left':
            return {
                ...buffer,
                cursor: outcome.word ? prevWord(buffer.text, buffer.cursor) : Math.max(0, buffer.cursor - 1),
            };
        case 'cursor-right':
            return {
                ...buffer,
                cursor: outcome.word ? nextWord(buffer.text, buffer.cursor) : Math.min(buffer.text.length, buffer.cursor + 1),
            };
        case 'cursor-home':
            return { ...buffer, cursor: 0 };
        case 'cursor-end':
            return { ...buffer, cursor: buffer.text.length };
        case 'insert':
            return { ...buffer, text: insertAt(buffer.text, buffer.cursor, outcome.text), cursor: buffer.cursor + outcome.text.length };
        default:
            return buffer;
    }
}
/** Step through history in `delta` direction. */
function stepHistory(buffer, delta) {
    const { history, historyIndex } = buffer;
    if (history.length === 0)
        return buffer;
    const next = historyIndex + delta;
    if (next < -1 || next >= history.length)
        return buffer;
    if (next === -1) {
        return { ...buffer, historyIndex: -1, text: '', cursor: 0 };
    }
    const draft = history[history.length - 1 - next] ?? '';
    return { ...buffer, historyIndex: next, text: draft, cursor: draft.length };
}
/** Insert `text` at `cursor` in `source`. */
function insertAt(source, cursor, text) {
    return source.slice(0, cursor) + text + source.slice(cursor);
}
/** Whether the prefix in the buffer is "complete enough" to surface UI. */
export function isSlashReady(text) {
    return /^\/[a-z][a-z0-9_-]*$/u.test(text);
}
/** Whether the prefix looks like an MCP tool or saved prompt reference. */
export function isAtReady(text) {
    return /^@[a-z0-9][a-z0-9_-]*(\/[a-z0-9_-]+)?$/u.test(text);
}
/** Whether the draft is a shell escape (`!`). */
export function isShellReady(text) {
    return text.length > 1 && text.startsWith('!');
}
/** Push a pending image into the buffer. */
export function queueImage(buffer, image) {
    return { ...buffer, images: [...buffer.images, image] };
}
//# sourceMappingURL=input.js.map