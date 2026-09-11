/**
 * dsh-kiro shell escape (`!cmd`) — run a host shell command and stream the
 * combined stdout/stderr into a system message in the transcript.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/shell
 */
/** Result of one shell execution. */
export interface ShellResult {
    /** Combined stdout + stderr text. */
    readonly output: string;
    /** Process exit code (or null when killed by signal). */
    readonly exitCode: number | null;
    /** Wall-clock duration in milliseconds. */
    readonly durationMs: number;
    /** Whether the command was truncated at the byte cap. */
    readonly truncated: boolean;
}
/**
 * Run one shell command line. We spawn a shell with `-c` and stream the output
 * up to `maxBytes`; once the cap is hit, we kill the child to avoid runaway
 * commands filling the transcript.
 * @param command - the exact command line as the user typed it (no leading `!`).
 * @param cwd - working directory; defaults to `process.cwd()`.
 * @param shell - shell executable; defaults to `bash` (Windows falls back to `cmd.exe`).
 * @param maxBytes - byte cap; default 64 KiB.
 * @returns the captured result.
 */
export declare function runShell(command: string, cwd?: string, shell?: string, maxBytes?: number): Promise<ShellResult>;
/**
 * Parse a leading `!` prefix from a user draft and return the command text.
 * Returns `undefined` when the draft is not a shell escape.
 * @param text - the raw draft text from the prompt.
 * @returns the command text without the leading `!`, or undefined.
 */
export declare function parseShellCommand(text: string): string | undefined;
