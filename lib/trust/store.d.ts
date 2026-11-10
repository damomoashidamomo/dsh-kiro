/**
 * dsh-kiro tool-trust store — per-tool allow list persisted to
 * `~/.kiro/settings/trusted-tools.json`. Used by the `kiro-trust` plugin to
 * short-circuit tool approval prompts once a tool has been trusted.
 *
 * @module @damomoashidamomo/dsh-kiro/trust/store
 */
/** Whether the trust store is enabled at all. */
export declare const TRUST_ALL: "all";
/** A single trusted-tool entry: name + reason + timestamp. */
export interface TrustEntry {
    /** Tool name as registered with the agent. */
    readonly name: string;
    /** When the trust was granted (epoch ms). */
    readonly grantedAt: number;
    /** Optional user-supplied reason. */
    readonly reason?: string;
}
/** Trust document persisted on disk. */
export interface TrustDocument {
    /** All-tools fast-path — `/tools trust-all` flips this. */
    readonly trustAll: boolean;
    /** Per-tool entries, name-keyed. */
    readonly entries: Record<string, TrustEntry>;
    /** Document schema version — bumped on breaking changes. */
    readonly version: 1;
}
/**
 * Resolve the path to the trust document.
 *
 * The real file lives in the directory kiro-cli owns, so **tests must never
 * reach it through this default**: every reader/writer below takes an explicit
 * path argument (`readTrust(path)`, `writeTrust(doc, path)`, `new
 * TrustStore(path)`), and the unit suite runs with `HOME` redirected to a
 * throwaway directory (`tests/setup.ts`) as a second safety net.
 */
export declare function trustPath(): string;
/** Read the persisted document; return a fresh one if missing or invalid. */
export declare function readTrust(path?: string): TrustDocument;
/** Persist the trust document to disk (atomic write via tmp+rename). */
export declare function writeTrust(doc: TrustDocument, path?: string): void;
/** In-memory trust manager that the runtime consults before invoking a tool. */
export declare class TrustStore {
    private document;
    /** Listeners notified after every mutation. */
    private readonly listeners;
    /** Where this store persists; defaults to the kiro-cli-owned file. */
    private readonly path;
    constructor(path?: string);
    /** Snapshot the current document. */
    snapshot(): TrustDocument;
    /** Subscribe to changes; returns the disposer. */
    subscribe(listener: (doc: TrustDocument) => void): () => void;
    /** Trust one tool; replaces any prior entry. */
    trust(name: string, reason?: string): void;
    /** Trust every built-in tool (used by `--trust-all-tools` and `/tools trust-all`). */
    trustAll(): void;
    /** Revoke trust on one tool. */
    untrust(name: string): void;
    /** Reset to an empty document (used by `/tools reset`). */
    reset(): void;
    /** Whether `name` is trusted right now. */
    isTrusted(name: string): boolean;
    /** Persist + notify. */
    private persist;
}
