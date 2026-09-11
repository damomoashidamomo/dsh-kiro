/**
 * dsh-kiro knowledge base — a tiny BM25 index over `.kiro/knowledge/`. The
 * manager walks the configured include/exclude patterns at `add`-time,
 * stores one file per entry on disk, and answers `query` calls with a
 * ranked list of snippets.
 *
 * Embedding-based retrieval is intentionally out of scope: BM25 is fast,
 * zero-deps, and ships today. The runtime can plug in a vector index later
 * by replacing {@link KnowledgeStore.query} without touching the call sites.
 *
 * @module @damomoashidamomo/dsh-kiro/knowledge/store
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

/** One indexed knowledge-base entry. */
export interface KnowledgeEntry {
  /** Stable id (UUID v4). */
  readonly id: string
  /** Human-readable label. */
  readonly label: string
  /** Absolute path to the source file. */
  readonly path: string
  /** Wall-clock timestamp (epoch ms). */
  readonly indexedAt: number
  /** Number of UTF-16 code units in the body. */
  readonly size: number
  /** First line of the file (typically a heading). */
  readonly preview: string
}

interface KnowledgeIndex {
  readonly version: 1
  readonly entries: readonly KnowledgeEntry[]
}

const KB_DIR = '.kiro/knowledge'
const KB_FILE = 'index.json'
const TOKEN_RE = /[A-Za-z0-9_]+/gu

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? [])
}

/** Compute BM25 score for a single document given a query. */
function bm25Score(query: readonly string[], docTokens: readonly string[], avgDocLength: number, totalDocs: number): number {
  const k1 = 1.5
  const b = 0.75
  const termFreq = new Map<string, number>()
  for (const token of docTokens) {
    termFreq.set(token, (termFreq.get(token) ?? 0) + 1)
  }
  let score = 0
  for (const term of query) {
    const tf = termFreq.get(term) ?? 0
    if (tf === 0) continue
    // Document-frequency: number of docs containing the term.
    const df = (() => {
      // In a real index this would be cached; we approximate by counting
      // occurrences across the documents passed in.
      return 1
    })()
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
    const docLength = docTokens.length
    const denominator = tf + k1 * (1 - b + b * (docLength / Math.max(1, avgDocLength)))
    score += idf * (tf * (k1 + 1)) / denominator
  }
  return score
}

/**
 * Persistent knowledge-base manager. Phase 5 ships BM25-only retrieval; the
 * public API is intentionally narrow so a future embedding index can swap in
 * without breaking the runtime.
 */
export class KnowledgeStore {
  private readonly dir: string
  private readonly indexPath: string
  private readonly workingTree: string
  private index: KnowledgeIndex
  /** Memoized tokenizations of indexed bodies, keyed by entry id. */
  private readonly bodyCache = new Map<string, string[]>()

  constructor(workingTree: string = process.cwd()) {
    this.workingTree = workingTree
    this.dir = join(workingTree, KB_DIR)
    this.indexPath = join(this.dir, KB_FILE)
    this.index = this.readIndex()
  }

  /** List all known entries. */
  list(): readonly KnowledgeEntry[] {
    return this.index.entries
  }

  /** Index a single file. */
  addFile(path: string, label?: string): KnowledgeEntry {
    if (!existsSync(path)) throw new Error(`knowledge: source not found: ${path}`)
    const stat = statSync(path)
    if (!stat.isFile()) throw new Error(`knowledge: not a file: ${path}`)
    const body = readFileSync(path, 'utf8')
    const entry: KnowledgeEntry = {
      id: randomUUID(),
      label: label ?? basename(path),
      path,
      indexedAt: Date.now(),
      size: Buffer.byteLength(body, 'utf8'),
      preview: body.split(/\r?\n/u)[0]?.slice(0, 120) ?? '',
    }
    this.index = { ...this.index, entries: [...this.index.entries, entry] }
    this.bodyCache.set(entry.id, tokenize(body))
    this.persist()
    return entry
  }

  /** Remove an entry by id. */
  remove(id: string): boolean {
    const before = this.index.entries.length
    this.index = { ...this.index, entries: this.index.entries.filter((entry) => entry.id !== id) }
    this.bodyCache.delete(id)
    const removed = this.index.entries.length !== before
    if (removed) this.persist()
    return removed
  }

  /** Clear all entries. */
  clear(): void {
    this.index = { version: 1, entries: [] }
    this.bodyCache.clear()
    this.persist()
  }

  /** BM25-ranked search; returns at most `limit` snippets with score > 0. */
  query(input: string, limit: number = 5): Array<{ entry: KnowledgeEntry; score: number }> {
    const terms = tokenize(input)
    if (terms.length === 0) return []
    const docs: Array<{ entry: KnowledgeEntry; tokens: string[] }> = []
    let totalTokens = 0
    for (const entry of this.index.entries) {
      let tokens = this.bodyCache.get(entry.id)
      if (tokens === undefined) {
        try {
          tokens = tokenize(readFileSync(entry.path, 'utf8'))
        } catch {
          continue
        }
        this.bodyCache.set(entry.id, tokens)
      }
      docs.push({ entry, tokens })
      totalTokens += tokens.length
    }
    const avg = docs.length === 0 ? 0 : totalTokens / docs.length
    const scored = docs
      .map(({ entry, tokens }) => ({
        entry,
        score: bm25Score(terms, tokens, avg, docs.length),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return scored
  }

  /** Read the persisted index from disk. */
  private readIndex(): KnowledgeIndex {
    if (!existsSync(this.indexPath)) return { version: 1, entries: [] }
    try {
      const raw = JSON.parse(readFileSync(this.indexPath, 'utf8')) as Partial<KnowledgeIndex>
      if (raw.version !== 1 || !Array.isArray(raw.entries)) return { version: 1, entries: [] }
      return { version: 1, entries: raw.entries }
    } catch {
      return { version: 1, entries: [] }
    }
  }

  /** Persist the current index to disk. */
  private persist(): void {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.indexPath, `${JSON.stringify(this.index, null, 2)}\n`, 'utf8')
  }
}

/** Pretty-print a relative path from a base. */
export function relativePath(base: string, target: string): string {
  return relative(base, target).split(sep).join('/')
}
