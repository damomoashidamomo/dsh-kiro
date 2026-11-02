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
export type EffortLevelSource = 'model' | 'provider' | 'inferred'

/** Resolved level list plus its provenance. */
export interface EffortLevels {
  readonly levels: readonly string[]
  readonly source: EffortLevelSource
}

/** Structural slice of the llm-pi-ai settings catalog we read. */
export interface PiAiCatalogSlice {
  readonly providers?: Readonly<Record<string, {
    readonly reasoningEfforts?: Record<string, unknown> | readonly string[]
    readonly models?: readonly { id: string; reasoningEfforts?: Record<string, unknown> | readonly string[] }[]
  }>>
}

function keysOf(value: Record<string, unknown> | readonly string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.length > 0 ? [...value] : undefined
  const keys = Object.keys(value)
  return keys.length > 0 ? keys : undefined
}

/**
 * Infer a conservative ladder from the model id's family markers. Names are
 * the only signal available without a declaration or a probe.
 */
export function inferEffortLevels(modelId: string): readonly string[] {
  const id = modelId.toLowerCase()
  if (/(r1|reason|think|o1|o3|o4|ultra|max)/.test(id)) return ['low', 'high', 'max']
  if (/(flash|lite|mini|tiny|air|turbo|fast)/.test(id)) return ['low', 'high']
  // Modern default: assume the standard ladder — most current gateways
  // forward reasoning_effort; /effort probe verifies when in doubt.
  return ['low', 'high', 'max']
}

/**
 * Resolve the effort ladder for one model. Always returns something (the
 * heuristic is the floor); `undefined` only when the catalog is missing
 * AND the provider/model ids are unknown.
 */
export function resolveEffortLevels(
  catalog: PiAiCatalogSlice | undefined,
  provider: string | undefined,
  model: string | undefined,
): EffortLevels | undefined {
  if (provider === undefined || model === undefined) return undefined
  const providerEntry = catalog?.providers?.[provider]
  const modelEntry = providerEntry?.models?.find((m) => m.id === model)
  const modelLevels = keysOf(modelEntry?.reasoningEfforts)
  if (modelLevels !== undefined) return { levels: modelLevels, source: 'model' }
  const providerLevels = keysOf(providerEntry?.reasoningEfforts)
  if (providerLevels !== undefined) return { levels: providerLevels, source: 'provider' }
  return { levels: inferEffortLevels(model), source: 'inferred' }
}

/** Human label for a level source, for status lines and /effort output. */
export function effortSourceLabel(source: EffortLevelSource): string {
  if (source === 'model') return '模型声明'
  if (source === 'provider') return 'Provider 默认'
  return '名称推断（未验证，可用 /effort probe 实测）'
}
