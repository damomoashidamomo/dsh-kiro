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
/** What the picker shows for a session: a title, else the first user message. */
export interface SessionTitle {
    readonly title: string;
    readonly firstUser: string;
    /**
     * Slash commands the session ran (`/chat list`), in order, deduped. A session
     * that only ever ran commands has neither a title nor a message — the
     * commands are then the only thing that tells one such session from another.
     */
    readonly commands: readonly string[];
}
/**
 * Read a session's summary straight from its log file.
 *
 * This deliberately does NOT go through the platform's session query: its
 * persistence listing refuses to load ANY log once the store contains a
 * duplicate session id ("appears in multiple project directories") or a log
 * whose tail fails validation, which silently removed every title from the
 * /chat menu and from `/chat list`. Reading the file we already located keeps
 * the listing working whatever shape the store is in.
 *
 * The log is an APPEND log of concatenated zstd frames, and
 * `zstdDecompressSync` stops after the first one — so a single call would only
 * ever see the header. Split on the magic and decode frame by frame; `maxBytes`
 * bounds the work on logs that ran for hours.
 */
export declare function readSessionTitle(dir: string, maxBytes?: number): SessionTitle;
/**
 * Async twin of {@link readSessionTitle}. Summaries are read while the /chat
 * menu is already on screen, so the scan must not block the Ink event loop:
 * every frame decode is awaited (yielding between frames) and the file itself
 * is read through `fs/promises`.
 */
export declare function readSessionTitleAsync(dir: string, maxBytes?: number): Promise<SessionTitle>;
/**
 * Directory a session for `cwd` belongs in: the platform encodes the project
 * path into the bucket name (`/tmp/x` -> `--tmp-x--`, a space becomes `~0020`).
 * A restored session must land in the bucket of the CURRENT directory so it
 * shows up in `/chat list` here.
 */
export declare function sessionSourceDir(cwd: string, home?: string): string;
/** Drop the cached listing (after a delete, or in tests). */
export declare function invalidateSessionCache(): void;
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
