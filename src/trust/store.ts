/**
 * dsh-kiro tool-trust store — per-tool allow list persisted to
 * `~/.dsh-kiro/settings/trusted-tools.json`. Used by the `kiro-trust` plugin to
 * short-circuit tool approval prompts once a tool has been trusted.
 *
 * @module @damomoashidamomo/dsh-kiro/trust/store
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { dshKiroUserRoot } from '../utils/kiro-home'

/** Whether the trust store is enabled at all. */
export const TRUST_ALL = 'all' as const

/** A single trusted-tool entry: name + reason + timestamp. */
export interface TrustEntry {
  /** Tool name as registered with the agent. */
  readonly name: string
  /** When the trust was granted (epoch ms). */
  readonly grantedAt: number
  /** Optional user-supplied reason. */
  readonly reason?: string
}

/** Trust document persisted on disk. */
export interface TrustDocument {
  /** All-tools fast-path — `/tools trust-all` flips this. */
  readonly trustAll: boolean
  /** Per-tool entries, name-keyed. */
  readonly entries: Record<string, TrustEntry>
  /** Document schema version — bumped on breaking changes. */
  readonly version: 1
}

/** Default empty document. */
function emptyDocument(): TrustDocument {
  return { trustAll: false, entries: {}, version: 1 }
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
export function trustPath(): string {
  return join(dshKiroUserRoot(), 'settings', 'trusted-tools.json')
}

/** Read the persisted document; return a fresh one if missing or invalid. */
export function readTrust(path = trustPath()): TrustDocument {
  if (!existsSync(path)) return emptyDocument()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<TrustDocument>
    if (raw.version !== 1) return emptyDocument()
    return {
      trustAll: raw.trustAll === true,
      entries: typeof raw.entries === 'object' && raw.entries !== null
        ? raw.entries as Record<string, TrustEntry>
        : {},
      version: 1,
    }
  } catch {
    return emptyDocument()
  }
}

/** Persist the trust document to disk (atomic write via tmp+rename). */
export function writeTrust(doc: TrustDocument, path = trustPath()): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
}

/** In-memory trust manager that the runtime consults before invoking a tool. */
export class TrustStore {
  private document: TrustDocument
  /** Listeners notified after every mutation. */
  private readonly listeners = new Set<(doc: TrustDocument) => void>()
  /** Where this store persists; defaults to the kiro-cli-owned file. */
  private readonly path: string

  constructor(path = trustPath()) {
    this.path = path
    this.document = readTrust(path)
  }

  /** Snapshot the current document. */
  snapshot(): TrustDocument {
    return this.document
  }

  /** Subscribe to changes; returns the disposer. */
  subscribe(listener: (doc: TrustDocument) => void): () => void {
    this.listeners.add(listener)
    listener(this.document)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Trust one tool; replaces any prior entry. */
  trust(name: string, reason?: string): void {
    if (name === '' || name === TRUST_ALL) return
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
    }
    this.persist()
  }

  /** Trust every built-in tool (used by `--trust-all-tools` and `/tools trust-all`). */
  trustAll(): void {
    this.document = { ...this.document, trustAll: true }
    this.persist()
  }

  /** Revoke trust on one tool. */
  untrust(name: string): void {
    const { [name]: _removed, ...rest } = this.document.entries
    void _removed
    this.document = { ...this.document, entries: rest }
    this.persist()
  }

  /** Reset to an empty document (used by `/tools reset`). */
  reset(): void {
    this.document = emptyDocument()
    this.persist()
  }

  /** Whether `name` is trusted right now. */
  isTrusted(name: string): boolean {
    return this.document.trustAll || this.document.entries[name] !== undefined
  }

  /** Persist + notify. */
  private persist(): void {
    writeTrust(this.document, this.path)
    for (const listener of this.listeners) listener(this.document)
  }
}
