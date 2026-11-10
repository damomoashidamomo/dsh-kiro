/**
 * Global guard for the unit suite: **the real `~/.kiro` AND `~/.dsh-kiro`
 * must not change**.
 *
 * `~/.kiro` is kiro-cli's own directory. A test once deleted and rewrote
 * `~/.kiro/settings/trusted-tools.json` on every run because the trust store
 * defaulted to that path (fixed: `TrustStore`/`readTrust`/`writeTrust` now take
 * an explicit path, and the tests pass a /tmp one). To make sure this class of
 * leak cannot come back silently, the whole unit run is bracketed: the tree is
 * snapshotted before the first test and compared after the last one, and any
 * created/modified/deleted file fails the run.
 *
 * Opt out with `DSH_KIRO_HOME_GUARD=0` (a concurrent kiro-cli session of your
 * own legitimately writes there and would otherwise trip the guard). Point the
 * guard elsewhere with `DSH_KIRO_HOME_GUARD_ROOT` (used by its own spec).
 */

import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Snapshot of one tree: absolute path → "size:mtimeMs". */
export type TreeSnapshot = Map<string, string>

/** Directories the guard protects (or the single override). */
export function guardRoots(): string[] {
  const override = process.env.DSH_KIRO_HOME_GUARD_ROOT
  if (override !== undefined && override !== '') return [override]
  return [join(homedir(), '.kiro'), join(homedir(), '.dsh-kiro')]
}

/** Walk `dir` and fingerprint every regular file; a missing dir is empty. */
export function snapshotTree(dir: string): TreeSnapshot {
  const out: TreeSnapshot = new Map()
  const walk = (current: string): void => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return // missing or unreadable — nothing to fingerprint
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      try {
        const stats = statSync(path)
        out.set(path, `${stats.size}:${stats.mtimeMs}`)
      } catch {
        // vanished while walking — the diff will not see it either way
      }
    }
  }
  walk(dir)
  return out
}

/** Human-readable list of what changed between two snapshots ('' = identical). */
export function diffSnapshots(before: TreeSnapshot, after: TreeSnapshot): string[] {
  const changes: string[] = []
  for (const [path, signature] of after) {
    const previous = before.get(path)
    if (previous === undefined) changes.push(`created  ${path}`)
    else if (previous !== signature) changes.push(`modified ${path}`)
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changes.push(`deleted  ${path}`)
  }
  return changes
}

let before: Array<{ root: string; snapshot: TreeSnapshot }> = []

export function setup(): void {
  if (process.env.DSH_KIRO_HOME_GUARD === '0') return
  before = guardRoots().map((root) => ({ root, snapshot: snapshotTree(root) }))
}

export function teardown(): void {
  if (before.length === 0) return
  const changes: string[] = []
  for (const entry of before) {
    changes.push(...diffSnapshots(entry.snapshot, snapshotTree(entry.root)))
  }
  before = []
  if (changes.length === 0) return
  throw new Error(
    [
      `unit tests changed a real home directory (one of: ${guardRoots().join(', ')}):`,
      ...changes.map((line) => `  ${line}`),
      'A test reached a real-home default. Aim it at a /tmp path instead',
      '(TrustStore(path), agentDirs({user}), DSH_KIRO_HOME, …).',
      'Set DSH_KIRO_HOME_GUARD=0 to skip this guard.',
    ].join('\n'),
  )
}
