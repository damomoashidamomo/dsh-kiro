/**
 * `/loop` — choose the turn driver: `dsh` (the platform's dsh-agent-loop,
 * full tools) or `kiro` (dsh-kiro's own driver; P1 = text-only chat, tools
 * land with the Rust engine). The transcript and approvals UI are shared;
 * only the turn engine differs.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/loop
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const loopCommand: CommandDefinition;
