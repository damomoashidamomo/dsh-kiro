/**
 * kiro-guardrail — the confirm-first mindset as a built-in system-prompt
 * section (P11, from the kiro-habits analysis): before mutating production
 * environments (service restarts, deployments, cluster operations) or
 * writing configuration outside the repository, the agent must state its
 * plan and impact and wait for explicit approval. Project steering loaded
 * later in the prompt can sharpen or relax this rule.
 *
 * @module @damomoashidamomo/dsh-kiro/guardrail
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-guardrail";
/** The section's fixed guidance text. */
export declare const GUARDRAIL_TEXT: string;
/** Mount the guardrail section (order 640, before kiro:steering at 650). */
export declare function apply(ctx: Context): void;
