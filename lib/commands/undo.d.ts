/**
 * `/undo` — restore the workspace to the checkpoint BEFORE the last one
 * (undo the last turn's changes). The auto-snapshot at every turn end means
 * snapshot N is taken AFTER turn N, so undo restores N-1. Requires the
 * shadow repo (/checkpoint init); confirmation is explicit: prints the plan
 * and requires /undo confirm.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/undo
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const undoCommand: CommandDefinition;
