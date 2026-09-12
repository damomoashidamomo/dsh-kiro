/**
 * Session catalog — read on-disk session headers from the JSONL persistence
 * store under `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`. The
 * store keeps the durable log compressed with zstd (Node's built-in `zlib`),
 * so this module streams a single decompression per file and parses only the
 * first JSONL line — the `session` header — to build the listing.
 *
 * The header has the shape produced by `dsh-session-persistence-jsonl`:
 *   { type: "session", version: 3, id, createdAt, cwd, isSeeded, delegationDepth }
 *
 * @module @damomoashidamomo/dsh-kiro/utils/sessions
 */
import { SessionId } from '@deepseek-ai/dsh-session';
/** Header summary extracted from one session file. */
export interface SessionSummary {
    /** Raw session id (with the `session-` prefix). */
    readonly id: string;
    /** Branded session id usable for `--resume-id`. */
    readonly sessionId: SessionId;
    /** Absolute path to the session's working directory at creation time. */
    readonly cwd: string;
    /** Unix epoch milliseconds when the session was opened. */
    readonly createdAt: number;
    /** Path to the session directory on disk (parent of session.v3.jsonl.zstd). */
    readonly dir: string;
    /** Source bucket — the cwd-hash segment under `sessions/`. */
    readonly source: string;
}
/** List every session under `$DSH_HOME/sessions`, newest first. */
export declare function listSessions(home?: string): readonly SessionSummary[];
/**
 * Narrow a session listing by the current working directory or an explicit
 * prefix. The default filter keeps any session whose `cwd` equals the target
 * OR is a descendant of it (a session opened in `/proj/sub` shows up in
 * listings from `/proj`, but not the other way around).
 */
export declare function filterSessions(summaries: readonly SessionSummary[], filter?: {
    cwd?: string | undefined;
}): readonly SessionSummary[];
/**
 * Remove a session by id. The id is the `session-<uuid>` directory name; we
 * search every source bucket under `sessions/` for a matching directory.
 * Returns `true` when a directory was removed, `false` otherwise.
 */
export declare function deleteSession(id: string, home?: string): boolean;
/** Format a `createdAt` epoch as `YYYY-MM-DD HH:MM` in local time. */
export declare function formatTimestamp(epochMs: number): string;
