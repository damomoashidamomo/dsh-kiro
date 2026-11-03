/**
 * `/tools` — choose the tool EXECUTION engine for the kiro-loop:
 *   dsh  — the platform pipeline (default; sandbox + approvals inside ctx.tools)
 *   rust — the kiro-toold Rust engine: one freshly Landlock-sandboxed
 *          process per call (bash / fs_read / fs_write; everything else
 *          still goes through the platform pipeline).
 *
 * @module @damomoashidamomo/dsh-kiro/commands/tools
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const toolsCommand: CommandDefinition;
