/**
 * `/chat` — manage saved sessions: list, resume, switch, delete.
 *
 * Reads headers directly from `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`
 * via {@link import('../utils/sessions').listSessions}, which keeps the
 * dependency surface narrow (no `dsh-session-query-sqlite` plumbing). By
 * default the listing only shows sessions whose working directory matches
 * (or is a parent of) the current `cwd` — most users only want their own
 * recent sessions.
 *
 * `resume`/`new` switch sessions IN PLACE through the `kiroSessionSwitch`
 * service (flush + dispose + agents.resume/create + transcript replay) —
 * no exit/restart needed. `--resume`/`--resume-id` remain boot-time
 * equivalents handled by `startup.ts` + the runtime mount.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * One-line description for a session row.
 *
 * Order: the durable title, then the first user message, then — for a session
 * that only ever ran slash commands (no message at all) — the commands it ran,
 * because a bare timestamp cannot tell two of those apart.
 */
export declare function summaryOf(session: {
    title: string;
    firstUser: string;
    commands: readonly string[];
}): string;
/** Render the listing table: one line per session, id · date · summary. */
declare function listText(rows: ReadonlyArray<{
    id: string;
    cwd: string;
    createdAt: number;
}>, opts: {
    all: boolean;
    titles?: ReadonlyMap<string, string>;
}): string;
/**
 * Hint for `/chat resume` without an id.
 *
 * It used to re-print the five most recent sessions, which duplicated the table
 * `/chat list` already prints. Point at the two ways to pick a session instead.
 */
export declare function resumeHint(): string;
/** How many recent sessions the option menu offers (before height fitting). */
export declare const PICKER_SESSIONS = 20;
/**
 * Bridge for the /chat option menu: recent sessions for this cwd.
 *
 * Titles are NOT loaded here (that is async); the picker shows the id and
 * patch-in titles arrive through {@link chatTitlesBridge}. It used to hand
 * back `title: ''` for every row, which is why the menu always said
 * 「（无简介）」.
 */
export declare function chatListBridge(): {
    /** Total sessions matching the cwd (the menu shows only the newest). */
    total: number;
    sessions: readonly {
        id: string;
        title: string;
        when: string;
    }[];
};
/**
 * Load the one-line titles for the sessions the option menu shows, keyed by
 * id (`session/title`, falling back to the first user message). An empty map
 * means the reader is unavailable — the rows then show the timestamp only.
 */
export declare function chatTitlesBridge(runtimeCtx: unknown, ids: readonly string[]): Promise<Map<string, string>>;
export declare const chatCommand: CommandDefinition;
export { listText };
