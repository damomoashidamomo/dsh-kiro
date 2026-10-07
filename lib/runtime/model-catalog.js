/**
 * Shared model-catalog lookups (the `llm-pi-ai` settings namespace). Kept
 * dependency-free so both the /model command and the runtime boot can read
 * it without import cycles.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/model-catalog
 */
/** Resolve a model's catalog context window, when the config declares one. */
export function contextWindowOf(piAi, provider, model) {
    return piAi?.providers?.[provider]?.models?.find((m) => m.id === model)?.contextWindow;
}
//# sourceMappingURL=model-catalog.js.map