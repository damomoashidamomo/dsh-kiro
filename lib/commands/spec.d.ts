/**
 * `/spec` — kiro-cli's confirm-first development cycle (P3-S1):
 *   /spec start <feature>   begin: the model drafts requirements.md
 *   /spec approve           human gate: advance to the next phase
 *   /spec show              current phase + files
 *   /spec revise <note>     bounce back to the current phase with feedback
 *   /spec abort             abandon the active spec
 * Phase order: requirements → design → tasks → implement → done. The model
 * never advances a phase by itself — only /spec approve does.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/spec
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const specCommand: CommandDefinition;
