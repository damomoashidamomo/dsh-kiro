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
/** One indexed knowledge-base entry. */
export interface KnowledgeEntry {
    /** Stable id (UUID v4). */
    readonly id: string;
    /** Human-readable label. */
    readonly label: string;
    /** Absolute path to the source file. */
    readonly path: string;
    /** Wall-clock timestamp (epoch ms). */
    readonly indexedAt: number;
    /** Number of UTF-16 code units in the body. */
    readonly size: number;
    /** First line of the file (typically a heading). */
    readonly preview: string;
}
/** A single ranked hit returned by {@link KnowledgeStore.query}. */
export interface KnowledgeHit {
    /** The matched entry. */
    readonly entry: KnowledgeEntry;
    /** BM25 score (higher is better; > 0 means at least one term matched). */
    readonly score: number;
    /** A short window of the body around the best term match. */
    readonly snippet: string;
}
/** Tokenize text into search terms (ASCII identifiers + CJK unigrams). */
export declare function tokenize(text: string): string[];
/** Options for {@link KnowledgeStore.addDir}. */
export interface AddDirOptions {
    /** Only files with these lowercase extensions are indexed. */
    readonly extensions?: readonly string[];
    /** Extra directory names to skip (merged with the built-in list). */
    readonly skip?: readonly string[];
    /** Label prefix for entries (default: the directory basename). */
    readonly labelPrefix?: string;
}
/**
 * Persistent knowledge-base manager. BM25-only retrieval today; the public
 * API is intentionally narrow so a future embedding index can swap in
 * without breaking the runtime.
 */
export declare class KnowledgeStore {
    private readonly dir;
    private readonly indexPath;
    private readonly workingTree;
    private index;
    /** Memoized bodies + tokenizations of indexed entries, keyed by id. */
    private readonly modelCache;
    /** Cached per-term document frequency, rebuilt lazily. */
    private docFreqCache;
    constructor(workingTree?: string);
    /** Number of indexed entries. */
    size(): number;
    /** List all known entries. */
    list(): readonly KnowledgeEntry[];
    /**
     * Index a single file. Re-adding a path that is already indexed refreshes
     * that entry in place (same id, updated body stats) instead of duplicating
     * it; `add` is idempotent per source path.
     */
    addFile(path: string, label?: string): KnowledgeEntry;
    /**
     * Recursively index a directory. Hidden directories (`.git`, `node_modules`,
     * `.kiro`, …) are skipped, as are files above {@link MAX_FILE_BYTES},
     * binary-looking files, and files whose extension is not in `options.extensions`.
     */
    addDir(dir: string, options?: AddDirOptions): KnowledgeEntry[];
    /** Refresh an entry's body from its source file. */
    update(ref: string): KnowledgeEntry | undefined;
    /** Remove an entry by id, list index (1-based), label, or source path. */
    remove(ref: string): boolean;
    /** Clear all entries. */
    clear(): void;
    /** BM25-ranked search; returns at most `limit` snippets with score > 0. */
    query(input: string, limit?: number): KnowledgeHit[];
    /** Resolve a user-facing reference (id prefix, 1-based index, label, path). */
    resolveRef(ref: string): KnowledgeEntry | undefined;
    /** Build the model for one entry, reading the body from disk if needed. */
    private model;
    /** Derive a {@link DocModel} from a raw body. */
    private modelFor;
    /** Compute per-term document frequency over the current entries. */
    private docFrequency;
    /** Read the persisted index from disk. */
    private readIndex;
    /** Persist the current index to disk. */
    private persist;
}
/** Pretty-print a relative path from a base. */
export declare function relativePath(base: string, target: string): string;
