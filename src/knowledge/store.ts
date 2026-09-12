/**
 * dsh-kiro knowledge base — a tiny BM25 index over `.kiro/knowledge/`. The
 * manager walks the configured include/exclude patterns at `add`-time,
 * stores one file per entry on disk, and answers `query` calls with a
 * ranked list of snippets.
 *
 * BM25 details: tokenization is ASCII-identifier based plus CJK unigrams
 * (each Han character is its own term), which makes both English and
 * Chinese notes searchable without any dependencies. Term frequencies and
 * document frequencies are computed from the indexed bodies and cached, so
 * scoring uses a real IDF (`ln(1 + (N - df + 0.5) / (df + 0.5))`) and
 * average-document-length normalization instead of the placeholder math of
 * earlier iterations.
 *
 * Embedding-based retrieval is intentionally out of scope: BM25 is fast,
 * zero-deps, and ships today. The runtime can plug in a vector index later
 * by replacing {@link KnowledgeStore.query} without touching the call sites.
 *
 * @module @damomoashidamomo/dsh-kiro/knowledge/store
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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

/** A single ranked hit returned by {@link KnowledgeStore.query}. */
export interface KnowledgeHit {
  /** The matched entry. */
  readonly entry: KnowledgeEntry
  /** BM25 score (higher is better; > 0 means at least one term matched). */
  readonly score: number
  /** A short window of the body around the best term match. */
  readonly snippet: string
}

interface KnowledgeIndex {
  readonly version: 1
  readonly entries: readonly KnowledgeEntry[]
}

/** Cached per-entry derivation used for scoring and snippets. */
interface DocModel {
  readonly body: string
  /** Lower-cased token list (ASCII identifiers + CJK unigrams). */
  readonly tokens: readonly string[]
  /** Term frequency map over `tokens`. */
  readonly tf: ReadonlyMap<string, number>
}

const KB_DIR = '.kiro/knowledge'
const KB_FILE = 'index.json'
const TOKEN_RE = /[a-z0-9_]+/gu
const CJK_RE = /[\u4e00-\u9fff]/gu
const BM25_K1 = 1.5
const BM25_B = 0.75
/** Default file extensions accepted by {@link KnowledgeStore.addDir}. */
const DEFAULT_EXTENSIONS = [
  'md', 'txt', 'ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'yml',
  'py', 'sh', 'rs', 'go', 'c', 'h', 'cpp', 'hpp', 'toml', 'css',
  'html', 'vue', 'svelte', 'sql', 'rb', 'java', 'kt',
]
/** Directories always skipped by {@link KnowledgeStore.addDir}. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.kiro', '.dsh', 'dist', 'build', '.next'])
/** Files larger than this (bytes) are skipped by {@link KnowledgeStore.addDir}. */
const MAX_FILE_BYTES = 1_048_576
/** Default snippet window: characters on each side of the first match. */
const SNIPPET_RADIUS = 120

/** Tokenize text into search terms (ASCII identifiers + CJK unigrams). */
export function tokenize(text: string): string[] {
  const out: string[] = []
  const lowered = text.toLowerCase()
  for (const match of lowered.match(TOKEN_RE) ?? []) out.push(match)
  for (const match of text.match(CJK_RE) ?? []) out.push(match)
  return out
}

/** Compute the BM25 score of one document against one query. */
function bm25Score(
  queryTerms: readonly string[],
  tf: ReadonlyMap<string, number>,
  docLength: number,
  avgDocLength: number,
  totalDocs: number,
  docFrequency: (term: string) => number,
): number {
  if (docLength === 0 || totalDocs === 0) return 0
  let score = 0
  const seen = new Set<string>()
  for (const term of queryTerms) {
    if (seen.has(term)) continue
    seen.add(term)
    const freq = tf.get(term) ?? 0
    if (freq === 0) continue
    const df = docFrequency(term)
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
    const denom = freq + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / Math.max(1, avgDocLength)))
    score += idf * ((freq * (BM25_K1 + 1)) / denom)
  }
  return score
}

/** Extract a readable window around the first query-term hit in `body`. */
function buildSnippet(body: string, queryTerms: readonly string[], fallback: string): string {
  const lowered = body.toLowerCase()
  let index = -1
  for (const term of queryTerms) {
    if (term.length === 0) continue
    index = lowered.indexOf(term)
    if (index !== -1) break
  }
  if (index === -1) return fallback
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(body.length, index + termLengthAt(body, index) + SNIPPET_RADIUS)
  let snippet = body.slice(start, end).replace(/\s+/gu, ' ').trim()
  if (start > 0) snippet = `…${snippet}`
  if (end < body.length) snippet = `${snippet}…`
  return snippet
}

/** Length of the word/CJK run starting at `index` (used by the snippet window). */
function termLengthAt(body: string, index: number): number {
  const rest = body.slice(index)
  const ascii = rest.match(/^[a-z0-9_]+/u)
  if (ascii !== null) return ascii[0].length
  const cjk = rest.match(/^[\u4e00-\u9fff]/u)
  return cjk === null ? 1 : 1
}

/** Options for {@link KnowledgeStore.addDir}. */
export interface AddDirOptions {
  /** Only files with these lowercase extensions are indexed. */
  readonly extensions?: readonly string[]
  /** Extra directory names to skip (merged with the built-in list). */
  readonly skip?: readonly string[]
  /** Label prefix for entries (default: the directory basename). */
  readonly labelPrefix?: string
}

/**
 * Persistent knowledge-base manager. BM25-only retrieval today; the public
 * API is intentionally narrow so a future embedding index can swap in
 * without breaking the runtime.
 */
export class KnowledgeStore {
  private readonly dir: string
  private readonly indexPath: string
  private readonly workingTree: string
  private index: KnowledgeIndex
  /** Memoized bodies + tokenizations of indexed entries, keyed by id. */
  private readonly modelCache = new Map<string, DocModel>()
  /** Cached per-term document frequency, rebuilt lazily. */
  private docFreqCache: Map<string, number> | undefined

  constructor(workingTree: string = process.cwd()) {
    this.workingTree = workingTree
    this.dir = join(workingTree, KB_DIR)
    this.indexPath = join(this.dir, KB_FILE)
    this.index = this.readIndex()
  }

  /** Number of indexed entries. */
  size(): number {
    return this.index.entries.length
  }

  /** List all known entries. */
  list(): readonly KnowledgeEntry[] {
    return this.index.entries
  }

  /**
   * Index a single file. Re-adding a path that is already indexed refreshes
   * that entry in place (same id, updated body stats) instead of duplicating
   * it; `add` is idempotent per source path.
   */
  addFile(path: string, label?: string): KnowledgeEntry {
    if (!existsSync(path)) throw new Error(`knowledge: source not found: ${path}`)
    const stat = statSync(path)
    if (!stat.isFile()) throw new Error(`knowledge: not a file: ${path}`)
    const body = readFileSync(path, 'utf8')
    const existing = this.index.entries.find((entry) => entry.path === path)
    const model = this.modelFor(body)
    if (existing !== undefined) {
      const updated: KnowledgeEntry = {
        ...existing,
        label: label ?? existing.label,
        indexedAt: Date.now(),
        size: Buffer.byteLength(body, 'utf8'),
        preview: body.split(/\r?\n/u)[0]?.slice(0, 120) ?? '',
      }
      this.index = {
        ...this.index,
        entries: this.index.entries.map((entry) => (entry.id === existing.id ? updated : entry)),
      }
      this.modelCache.set(updated.id, model)
      this.docFreqCache = undefined
      this.persist()
      return updated
    }
    const entry: KnowledgeEntry = {
      id: randomUUID(),
      label: label ?? basename(path),
      path,
      indexedAt: Date.now(),
      size: Buffer.byteLength(body, 'utf8'),
      preview: body.split(/\r?\n/u)[0]?.slice(0, 120) ?? '',
    }
    this.index = { ...this.index, entries: [...this.index.entries, entry] }
    this.modelCache.set(entry.id, model)
    this.docFreqCache = undefined
    this.persist()
    return entry
  }

  /**
   * Recursively index a directory. Hidden directories (`.git`, `node_modules`,
   * `.kiro`, …) are skipped, as are files above {@link MAX_FILE_BYTES},
   * binary-looking files, and files whose extension is not in `options.extensions`.
   */
  addDir(dir: string, options: AddDirOptions = {}): KnowledgeEntry[] {
    if (!existsSync(dir)) throw new Error(`knowledge: directory not found: ${dir}`)
    if (!statSync(dir).isDirectory()) throw new Error(`knowledge: not a directory: ${dir}`)
    const extensions = new Set((options.extensions ?? DEFAULT_EXTENSIONS).map((ext) => ext.toLowerCase().replace(/^\./u, '')))
    const skip = new Set([...SKIP_DIRS, ...(options.skip ?? [])])
    const created: KnowledgeEntry[] = []
    const walk = (current: string, prefix: string): void => {
      let names: string[]
      try {
        names = readdirSync(current)
      } catch {
        return
      }
      names.sort()
      for (const name of names) {
        if (name.startsWith('.')) continue
        const full = join(current, name)
        let st: ReturnType<typeof statSync>
        try {
          st = statSync(full)
        } catch {
          continue
        }
        if (st.isDirectory()) {
          if (skip.has(name)) continue
          walk(full, `${prefix}${name}/`)
          continue
        }
        if (!st.isFile()) continue
        if (st.size > MAX_FILE_BYTES) continue
        const dot = name.lastIndexOf('.')
        const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
        if (ext !== '' && !extensions.has(ext)) continue
        let body: string
        try {
          body = readFileSync(full, 'utf8')
        } catch {
          continue
        }
        if (looksBinary(body)) continue
        const label = `${options.labelPrefix ?? basename(dir)}:${prefix}${name}`
        try {
          created.push(this.addFile(full, label))
        } catch {
          // Unreadable/racing files are skipped silently.
        }
      }
    }
    walk(dir, '')
    return created
  }

  /** Refresh an entry's body from its source file. */
  update(ref: string): KnowledgeEntry | undefined {
    const entry = this.resolveRef(ref)
    if (entry === undefined) return undefined
    try {
      return this.addFile(entry.path, entry.label)
    } catch (error: unknown) {
      throw new Error(`knowledge: update failed for ${entry.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Remove an entry by id, list index (1-based), label, or source path. */
  remove(ref: string): boolean {
    const entry = this.resolveRef(ref)
    if (entry === undefined) return false
    const before = this.index.entries.length
    this.index = { ...this.index, entries: this.index.entries.filter((row) => row.id !== entry.id) }
    this.modelCache.delete(entry.id)
    this.docFreqCache = undefined
    const removed = this.index.entries.length !== before
    if (removed) this.persist()
    return removed
  }

  /** Clear all entries. */
  clear(): void {
    this.index = { version: 1, entries: [] }
    this.modelCache.clear()
    this.docFreqCache = undefined
    this.persist()
  }

  /** BM25-ranked search; returns at most `limit` snippets with score > 0. */
  query(input: string, limit: number = 5): KnowledgeHit[] {
    const terms = tokenize(input)
    if (terms.length === 0) return []
    const docs = this.index.entries
      .map((entry) => ({ entry, model: this.model(entry) }))
      .filter((row): row is { entry: KnowledgeEntry; model: DocModel } => row.model !== undefined)
    const totalDocs = docs.length
    if (totalDocs === 0) return []
    const avgDocLength = docs.reduce((sum, row) => sum + row.model.tokens.length, 0) / totalDocs
    const docFrequency = this.docFrequency()
    const uniqueTerms = [...new Set(terms)]
    const scored = docs
      .map(({ entry, model }) => ({
        entry,
        score: bm25Score(uniqueTerms, model.tf, model.tokens.length, avgDocLength, totalDocs, docFrequency),
        snippet: buildSnippet(model.body, uniqueTerms, entry.preview),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    return scored
  }

  /** Resolve a user-facing reference (id prefix, 1-based index, label, path). */
  resolveRef(ref: string): KnowledgeEntry | undefined {
    const trimmed = ref.trim()
    if (trimmed === '') return undefined
    const byId = this.index.entries.find((entry) => entry.id.startsWith(trimmed))
    if (byId !== undefined) return byId
    if (/^\d+$/u.test(trimmed)) {
      const index = Number.parseInt(trimmed, 10)
      const entry = this.index.entries[index - 1]
      if (entry !== undefined) return entry
    }
    const byLabel = this.index.entries.find((entry) => entry.label === trimmed)
    if (byLabel !== undefined) return byLabel
    return this.index.entries.find((entry) => entry.path === trimmed || entry.path.endsWith(trimmed))
  }

  /** Build the model for one entry, reading the body from disk if needed. */
  private model(entry: KnowledgeEntry): DocModel | undefined {
    let cached = this.modelCache.get(entry.id)
    if (cached !== undefined) return cached
    try {
      const body = readFileSync(entry.path, 'utf8')
      cached = this.modelFor(body)
      this.modelCache.set(entry.id, cached)
      return cached
    } catch {
      return undefined
    }
  }

  /** Derive a {@link DocModel} from a raw body. */
  private modelFor(body: string): DocModel {
    const tokens = tokenize(body)
    const tf = new Map<string, number>()
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1)
    return { body, tokens, tf }
  }

  /** Compute per-term document frequency over the current entries. */
  private docFrequency(): (term: string) => number {
    if (this.docFreqCache === undefined) {
      const df = new Map<string, number>()
      for (const entry of this.index.entries) {
        const model = this.model(entry)
        if (model === undefined) continue
        for (const term of model.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1)
      }
      this.docFreqCache = df
    }
    const cache = this.docFreqCache
    return (term: string): number => cache.get(term) ?? 0
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

/** Heuristic: does the body look binary (NUL byte in the first 8 KiB)? */
function looksBinary(body: string): boolean {
  const head = body.slice(0, 8192)
  return head.includes('\u0000')
}

/** Pretty-print a relative path from a base. */
export function relativePath(base: string, target: string): string {
  return relative(base, target).split(sep).join('/')
}
