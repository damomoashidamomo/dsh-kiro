/**
 * `/chat` — manage saved sessions: list, resume, delete.
 *
 * Reads headers directly from `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`
 * via {@link import('../utils/sessions').listSessions}, which keeps the
 * dependency surface narrow (no `dsh-session-query-sqlite` plumbing). By
 * default the listing only shows sessions whose working directory matches
 * (or is a parent of) the current `cwd` — most users only want their own
 * recent sessions.
 *
 * `--resume`, `--resume-id`, and `--resume-picker` continue to be handled
 * by `startup.ts` before the runtime mounts, so this command focuses on
 * in-chat operations.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/** Render the listing table. */
declare function listText(rows: ReadonlyArray<{
    id: string;
    cwd: string;
    createdAt: number;
}>, opts: {
    all: boolean;
}): string;
export declare const chatCommand: CommandDefinition;
export { listText };
