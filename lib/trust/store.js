/**
 * dsh-kiro tool-trust store — per-tool allow list persisted to
 * `~/.kiro/settings/trusted-tools.json`. Used by the `kiro-trust` plugin to
 * short-circuit tool approval prompts once a tool has been trusted.
 *
 * @module @damomoashidamomo/dsh-kiro/trust/store
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
/** Whether the trust store is enabled at all. */
export const TRUST_ALL = 'all';
/** Default empty document. */
function emptyDocument() {
    return { trustAll: false, entries: {}, version: 1 };
}
/** Resolve the path to the trust document. */
export function trustPath() {
    return join(homedir(), '.kiro', 'settings', 'trusted-tools.json');
}
/** Read the persisted document; return a fresh one if missing or invalid. */
export function readTrust() {
    const path = trustPath();
    if (!existsSync(path))
        return emptyDocument();
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        if (raw.version !== 1)
            return emptyDocument();
        return {
            trustAll: raw.trustAll === true,
            entries: typeof raw.entries === 'object' && raw.entries !== null
                ? raw.entries
                : {},
            version: 1,
        };
    }
    catch {
        return emptyDocument();
    }
}
/** Persist the trust document to disk (atomic write via tmp+rename). */
export function writeTrust(doc) {
    const path = trustPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}
/** In-memory trust manager that the runtime consults before invoking a tool. */
export class TrustStore {
    document = readTrust();
    /** Listeners notified after every mutation. */
    listeners = new Set();
    /** Snapshot the current document. */
    snapshot() {
        return this.document;
    }
    /** Subscribe to changes; returns the disposer. */
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.document);
        return () => {
            this.listeners.delete(listener);
        };
    }
    /** Trust one tool; replaces any prior entry. */
    trust(name, reason) {
        if (name === '' || name === TRUST_ALL)
            return;
        this.document = {
            ...this.document,
            entries: {
                ...this.document.entries,
                [name]: {
                    name,
                    grantedAt: Date.now(),
                    ...reason !== undefined ? { reason } : {},
                },
            },
        };
        this.persist();
    }
    /** Trust every built-in tool (used by `--trust-all-tools` and `/tools trust-all`). */
    trustAll() {
        this.document = { ...this.document, trustAll: true };
        this.persist();
    }
    /** Revoke trust on one tool. */
    untrust(name) {
        const { [name]: _removed, ...rest } = this.document.entries;
        void _removed;
        this.document = { ...this.document, entries: rest };
        this.persist();
    }
    /** Reset to an empty document (used by `/tools reset`). */
    reset() {
        this.document = emptyDocument();
        this.persist();
    }
    /** Whether `name` is trusted right now. */
    isTrusted(name) {
        return this.document.trustAll || this.document.entries[name] !== undefined;
    }
    /** Persist + notify. */
    persist() {
        writeTrust(this.document);
        for (const listener of this.listeners)
            listener(this.document);
    }
}
//# sourceMappingURL=store.js.map