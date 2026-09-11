/**
 * kiro-knowledge — placeholder plugin. Phase 5 implements a BM25 index (and
 * optional embedding) over `.kiro/knowledge/`, with `/knowledge add|show|
 * remove|update|clear|cancel` and the `knowledge` retrieval tool.
 *
 * @module @damomoashidamomo/dsh-kiro/knowledge
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-knowledge";
/** Mount the placeholder plugin. */
export declare function apply(ctx: Context): void;
