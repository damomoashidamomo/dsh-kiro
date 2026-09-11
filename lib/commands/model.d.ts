/**
 * `/model` — pick the model the current session uses. The actual selection
 * goes through the `agentDefaultModel` service; this command writes the new
 * selection to the agent's settings scope so subsequent requests use it.
 *
 * Phase 3 ships the command UI; the actual selection-wiring on the live
 * Agent lands when we promote session-projection wiring to phase 4.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const modelCommand: CommandDefinition;
