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
