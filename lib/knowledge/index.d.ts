/**
 * kiro-knowledge — exposes a KnowledgeStore on the Cordis context so the
 * runtime and `/knowledge` command can introspect / search the BM25 index.
 *
 * @module @damomoashidamomo/dsh-kiro/knowledge
 */
import type { Context } from '@deepseek-ai/cordis';
/** Service identifier for the loaded knowledge store. */
export declare const KIRO_KNOWLEDGE = "kiroKnowledge";
/** Stable Cordis plugin name. */
export declare const name = "kiro-knowledge";
/** Mount the knowledge store. */
export declare function apply(ctx: Context): void;
export { KnowledgeStore } from './store';
export type { KnowledgeEntry } from './store';
