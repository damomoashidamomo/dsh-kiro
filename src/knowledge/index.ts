/**
 * kiro-knowledge — exposes a KnowledgeStore on the Cordis context so the
 * runtime and `/knowledge` command can introspect / search the BM25 index.
 *
 * @module @damomoashidamomo/dsh-kiro/knowledge
 */

import type { Context } from '@deepseek-ai/cordis'
import { KnowledgeStore } from './store'
import type { KnowledgeHit } from './store'

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

/**
 * Render a compact model-facing knowledge block from retrieval hits. Used by
 * the runtime to inject BM25 results into the agent context before a turn.
 */
export function renderKnowledgeContext(hits: readonly KnowledgeHit[]): string {
  if (hits.length === 0) return ''
  const lines: string[] = [`[kiro-knowledge · ${hits.length} hit${hits.length === 1 ? '' : 's'}]`]
  for (const { entry, snippet } of hits) {
    lines.push(`• ${entry.label}`)
    lines.push(`  ${snippet}`)
  }
  return lines.join('\n')
}

export { KnowledgeStore } from './store'
export type { KnowledgeEntry, KnowledgeHit, AddDirOptions } from './store'
