/**
 * kiro-steering — placeholder plugin. Phase 4 implements `.kiro/steering/*.md`
 * discovery with `always`/`conditional`/`manual` frontmatter and registers
 * each file as a system-prompt section.
 *
 * @module @damomoashidamomo/dsh-kiro/steering
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-steering";
/** Mount the placeholder plugin. */
export declare function apply(ctx: Context): void;
