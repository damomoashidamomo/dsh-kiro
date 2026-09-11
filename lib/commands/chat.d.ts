/**
 * `/chat` — manage saved sessions: new, list, resume, save, load, delete.
 *
 * Phase 3 implementation: reads from `ctx.sessions` + `ctx.sessionQuery`
 * (when present) to list, delete, and resume sessions; `--resume`,
 * `--resume-id`, and `--resume-picker` are handled by `startup.ts` before
 * the runtime mounts, so this command focuses on the in-chat operations.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
declare function listText(rows: ReadonlyArray<{
    id: string;
    title: string;
    cwd: string;
    updatedAt: number;
}>): string;
export declare const chatCommand: CommandDefinition;
export { listText };
