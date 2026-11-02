/**
 * Universal reasoning-effort level resolution (B-6 general strategy).
 *
 * Resolution ladder — the FIRST hit wins:
 *   1. model entry `reasoningEfforts` in the llm-pi-ai settings catalog
 *      (exact, verified by whoever wrote it);
 *   2. provider-level `reasoningEfforts` default (covers every model under
 *      that provider — new models gain the dial without per-model edits);
 *   3. name heuristic (family inference): reasoning-suffixed flagships get
 *      the full low/high/max ladder, flash/lite variants a conservative
 *      low/high. Marked `inferred` so the UI can say so honestly.
 *
 * `inferred` levels are a GUESS about the provider's wire behavior, not a
 * verified fact — `/effort probe` exists to check the real gateway.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/effort-levels
 */
/** Where a level list came from. */
export type EffortLevelSource = 'model' | 'provider' | 'inferred';
/** Resolved level list plus its provenance. */
export interface EffortLevels {
    readonly levels: readonly string[];
    readonly source: EffortLevelSource;
}
/** Structural slice of the llm-pi-ai settings catalog we read. */
export interface PiAiCatalogSlice {
    readonly providers?: Readonly<Record<string, {
        readonly reasoningEfforts?: Record<string, unknown> | readonly string[];
        readonly models?: readonly {
            id: string;
            reasoningEfforts?: Record<string, unknown> | readonly string[];
        }[];
    }>>;
}
/**
 * Infer a conservative ladder from the model id's family markers. Names are
 * the only signal available without a declaration or a probe.
 */
export declare function inferEffortLevels(modelId: string): readonly string[];
/**
 * Resolve the effort ladder for one model. Always returns something (the
 * heuristic is the floor); `undefined` only when the catalog is missing
 * AND the provider/model ids are unknown.
 */
export declare function resolveEffortLevels(catalog: PiAiCatalogSlice | undefined, provider: string | undefined, model: string | undefined): EffortLevels | undefined;
/** Human label for a level source, for status lines and /effort output. */
export declare function effortSourceLabel(source: EffortLevelSource): string;
