/**
 * `/model` — pick the model the current session uses.
 *
 * Two flows:
 *
 * 1. Interactive (kiro-style): `/model` with no argument opens a list
 *    picker populated from the DSH configuration file (`llm-pi-ai.providers`
 *    in `~/.dsh/settings.yaml`). ↑/↓ selects, Enter confirms, Esc cancels.
 *
 * 2. Direct: `/model <provider>/<model>` sets the selection immediately.
 *
 * Either path persists through `agentDefaultModel.saveSelection` (writes the
 * `agent-default-model` settings scope so the next launch picks it up) and
 * updates the status bar via the runtime's `kiroController` service.
 *
 * Note: the live Agent has its initial model baked into the loop setup; a
 * mid-flight change is reflected in the status bar but the in-flight turn
 * keeps using the original model. The new model applies on the next turn.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { PickerItem } from '../runtime/types';
/** Structural view of `llm-pi-ai` config from `~/.dsh/settings.yaml`. */
interface PiAiConfig {
    providers?: Record<string, {
        displayName?: string;
        models?: ReadonlyArray<{
            id: string;
            name?: string;
            contextWindow?: number;
        }>;
    }>;
}
declare function parseModel(input: string): {
    provider: string;
    model: string;
} | undefined;
/** Build picker rows from the DSH config's `llm-pi-ai.providers` catalog. */
declare function buildModelItems(piAi: PiAiConfig | undefined, current: {
    provider: string;
    model: string;
} | undefined): PickerItem[];
export declare const modelCommand: CommandDefinition;
export { parseModel, buildModelItems };
