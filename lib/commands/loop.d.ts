/**
 * `/loop` — choose the turn driver: `dsh` (the platform's dsh-agent-loop,
 * full tools) or `kiro` (dsh-kiro's own driver: full tool loop,
 * toolsSettings matrix, retry, auto-compaction, Rust engine optional). The transcript and approvals UI are shared;
 * only the turn engine differs.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/loop
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const loopCommand: CommandDefinition;
