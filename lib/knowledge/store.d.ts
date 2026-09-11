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
/**
 * Persistent knowledge-base manager. Phase 5 ships BM25-only retrieval; the
 * public API is intentionally narrow so a future embedding index can swap in
 * without breaking the runtime.
 */
export declare class KnowledgeStore {
    private readonly dir;
    private readonly indexPath;
    private readonly workingTree;
    private index;
    /** Memoized tokenizations of indexed bodies, keyed by entry id. */
    private readonly bodyCache;
    constructor(workingTree?: string);
    /** List all known entries. */
    list(): readonly KnowledgeEntry[];
    /** Index a single file. */
    addFile(path: string, label?: string): KnowledgeEntry;
    /** Remove an entry by id. */
    remove(id: string): boolean;
    /** Clear all entries. */
    clear(): void;
    /** BM25-ranked search; returns at most `limit` snippets with score > 0. */
    query(input: string, limit?: number): Array<{
        entry: KnowledgeEntry;
        score: number;
    }>;
    /** Read the persisted index from disk. */
    private readIndex;
    /** Persist the current index to disk. */
    private persist;
}
/** Pretty-print a relative path from a base. */
export declare function relativePath(base: string, target: string): string;
