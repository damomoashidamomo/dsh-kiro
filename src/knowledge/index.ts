/**
 * kiro-knowledge — exposes a KnowledgeStore on the Cordis context so the
 * runtime and `/knowledge` command can introspect / search the BM25 index.
 *
 * @module @damomoashidamomo/dsh-kiro/knowledge
 */

import type { Context } from '@deepseek-ai/cordis'
import { KnowledgeStore } from './store'

/** Service identifier for the loaded knowledge store. */
export const KIRO_KNOWLEDGE = 'kiroKnowledge'

/** Stable Cordis plugin name. */
export const name = 'kiro-knowledge'

/** Mount the knowledge store. */
export function apply(ctx: Context): void {
  const store = new KnowledgeStore(process.cwd())
  ctx.provide(KIRO_KNOWLEDGE, store)
  ctx.logger.info?.(`dsh-kiro: kiro-knowledge mounted (${store.list().length} entries)`)
}

export { KnowledgeStore } from './store'
export type { KnowledgeEntry } from './store'
