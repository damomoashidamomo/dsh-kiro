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
export type EffortHint = 'high' | 'max'

interface KeywordRule {
  readonly level: EffortHint
  readonly words: readonly string[]
}

/**
 * Ordered strongest-first: 'max' phrases win when a prompt matches both
 * tiers (e.g. "极限模式下深入分析这个崩溃").
 */
const RULES: readonly KeywordRule[] = [
  {
    level: 'max',
    words: ['ultrathink', '极限模式', '全面审查', '穷尽所有', '最难'],
  },
  {
    level: 'high',
    words: ['深入分析', '仔细推理', '认真思考', '排查根因', '架构设计', 'think hard', '深入思考', '彻底调查'],
  },
]

/**
 * Detect an effort hint in the prompt. Returns the strongest matching
 * level, or undefined when the prompt carries no escalation phrase.
 */
export function detectEffortHint(prompt: string): EffortHint | undefined {
  for (const rule of RULES) {
    for (const word of rule.words) {
      if (prompt.toLowerCase().includes(word.toLowerCase())) return rule.level
    }
  }
  return undefined
}

/**
 * Resolve the effective effort for this turn:
 *   manual (/effort)  >  keyword hint  >  undefined (model/profile default)
 * `declared` is the model's catalog-declared effort list; a hinted level the
 * model does not declare is ignored (the adapter would reject it).
 */
export function resolveAutoEffort(
  hinted: EffortHint | undefined,
  manual: string | undefined,
  declared: readonly string[] | undefined,
): string | undefined {
  if (manual !== undefined) return manual
  if (hinted === undefined) return undefined
  if (declared === undefined) return undefined
  return declared.includes(hinted) ? hinted : undefined
}
