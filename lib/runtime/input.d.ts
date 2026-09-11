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
/** A pending image attachment waiting to be sent alongside the next prompt. */
export interface PendingImage {
    /** Original file path or data URL. */
    readonly source: string;
    /** Image MIME type. */
    readonly mimeType: string;
    /** Inline base64 payload. */
    readonly base64: string;
    /** Optional caption written by the user. */
    readonly caption: string | undefined;
}
/** What the renderer should do with a key event. */
export type InputOutcome = {
    kind: 'ignore';
} | {
    kind: 'submit';
    text: string;
    images: readonly PendingImage[];
} | {
    kind: 'history-prev';
} | {
    kind: 'history-next';
} | {
    kind: 'auto-complete';
} | {
    kind: 'newline';
} | {
    kind: 'special-prefix';
    prefix: '/' | '@' | '!';
} | {
    kind: 'backspace';
} | {
    kind: 'delete';
} | {
    kind: 'cursor-left';
    word: boolean;
} | {
    kind: 'cursor-right';
    word: boolean;
} | {
    kind: 'cursor-home';
} | {
    kind: 'cursor-end';
} | {
    kind: 'insert';
    text: string;
};
/** Lightweight prompt buffer state. */
export interface PromptBuffer {
    /** Current draft text. */
    text: string;
    /** Cursor offset (UTF-16 code units) within the draft. */
    cursor: number;
    /** Ordered list of submitted drafts, newest last. */
    history: readonly string[];
    /** Index into the history when navigating; -1 means "current draft". */
    historyIndex: number;
    /** Buffer of pending images. */
    images: readonly PendingImage[];
}
/** Construct a fresh empty buffer. */
export declare function emptyBuffer(history?: readonly string[]): PromptBuffer;
/** Detect whether the draft starts with a special trigger character. */
export declare function detectPrefix(text: string): '/' | '@' | '!' | undefined;
/** Apply one keystroke outcome to the buffer; returns a new buffer. */
export declare function applyOutcome(buffer: PromptBuffer, outcome: InputOutcome): PromptBuffer;
/** Whether the prefix in the buffer is "complete enough" to surface UI. */
export declare function isSlashReady(text: string): boolean;
/** Whether the prefix looks like an MCP tool or saved prompt reference. */
export declare function isAtReady(text: string): boolean;
/** Whether the draft is a shell escape (`!`). */
export declare function isShellReady(text: string): boolean;
/** Push a pending image into the buffer. */
export declare function queueImage(buffer: PromptBuffer, image: PendingImage): PromptBuffer;
