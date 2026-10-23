/**
 * Keyword-driven reasoning-effort hints (P11-adjacent, habits analysis):
 * the model never self-adjusts its thinking depth — effort is an external
 * request parameter. This module maps natural escalation phrases in the
 * user's prompt to a symbolic level, so "深入分析一下" quietly gets more
 * thinking without a manual /effort toggle. Zero-cost deterministic
 * matching; the platform adapter translates the symbolic level per model
 * (models without declared efforts skip escalation gracefully).
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/effort-keywords
 */
/** Escalation levels the hint table can produce. */
export type EffortHint = 'high' | 'max';
/**
 * Detect an effort hint in the prompt. Returns the strongest matching
 * level, or undefined when the prompt carries no escalation phrase.
 */
export declare function detectEffortHint(prompt: string): EffortHint | undefined;
/**
 * Resolve the effective effort for this turn:
 *   manual (/effort)  >  keyword hint  >  undefined (model/profile default)
 * `declared` is the model's catalog-declared effort list; a hinted level the
 * model does not declare is ignored (the adapter would reject it).
 */
export declare function resolveAutoEffort(hinted: EffortHint | undefined, manual: string | undefined, declared: readonly string[] | undefined): string | undefined;
