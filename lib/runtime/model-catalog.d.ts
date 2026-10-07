/**
 * Shared model-catalog lookups (the `llm-pi-ai` settings namespace). Kept
 * dependency-free so both the /model command and the runtime boot can read
 * it without import cycles.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/model-catalog
 */
/** Structural shape of the `llm-pi-ai` settings we read. */
export interface PiAiConfig {
    providers?: Record<string, {
        displayName?: string;
        apiKeyEnv?: string;
        models?: ReadonlyArray<{
            id: string;
            name?: string;
            contextWindow?: number;
        }>;
    }>;
}
/** Resolve a model's catalog context window, when the config declares one. */
export declare function contextWindowOf(piAi: PiAiConfig | undefined, provider: string, model: string): number | undefined;
