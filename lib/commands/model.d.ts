/**
 * `/model <provider>/<model>` — pick the model the current session uses.
 *
 * The selection is persisted through `agentDefaultModel.saveSelection`, which
 * writes to the agent-default-model settings scope so the next launch (and
 * every session bound to that scope) picks it up. The status bar updates
 * immediately via the runtime's `kiroController` service.
 *
 * Note: the live Agent has its initial model baked into the loop setup; a
 * mid-flight change is reflected in the status bar but the in-flight turn
 * keeps using the original model. The new model applies on the next turn.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
declare function parseModel(input: string): {
    provider: string;
    model: string;
} | undefined;
export declare const modelCommand: CommandDefinition;
export { parseModel };
