/**
 * Session catalog — read on-disk session headers from the JSONL persistence
 * store under `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`. The
 * store keeps the durable log compressed with zstd (Node's built-in `zlib`),
 * so this module streams a single decompression per file and parses only the
 * first JSONL line — the `session` header — to build the listing.
 *
 * The header has the shape produced by `dsh-session-persistence-jsonl`:
 *   { type: "session", version: 3, id, createdAt, cwd, isSeeded, delegationDepth }
 *
 * @module @damomoashidamomo/dsh-kiro/utils/sessions
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'

/** Default `$DSH_HOME` when the env var is unset — `~/.dsh`. */
function defaultHome(): string {
  const env = process.env.DSH_HOME
  if (typeof env === 'string' && env.trim() !== '') return env
  return join(homedir(), '.dsh')
}

/** Header summary extracted from one session file. */
export interface SessionSummary {
  /** Raw session id (with the `session-` prefix). */
  readonly id: string
  /** Branded session id usable for `--resume-id`. */
  readonly sessionId: SessionId
  /** Absolute path to the session's working directory at creation time. */
  readonly cwd: string
  /** Unix epoch milliseconds when the session was opened. */
  readonly createdAt: number
  /** Path to the session directory on disk (parent of session.v3.jsonl.zstd). */
  readonly dir: string
  /** Source bucket — the cwd-hash segment under `sessions/`. */
  readonly source: string
}

/** Read and decompress a single session header from disk. */
function readHeader(path: string): { id: string; cwd: string; createdAt: number } | undefined {
  let compressed: Buffer
  try {
    compressed = readFileSync(path)
  } catch {
    return undefined
  }
  let plaintext: string
  try {
    plaintext = zstdDecompressSync(compressed).toString('utf8')
  } catch {
    return undefined
  }
  const firstNewline = plaintext.indexOf('\n')
  const head = firstNewline === -1 ? plaintext : plaintext.slice(0, firstNewline)
  let record: unknown
  try {
    record = JSON.parse(head)
  } catch {
    return undefined
  }
  if (
    record === null
    || typeof record !== 'object'
    || (record as { type?: unknown }).type !== 'session'
    || typeof (record as { id?: unknown }).id !== 'string'
    || typeof (record as { cwd?: unknown }).cwd !== 'string'
    || typeof (record as { createdAt?: unknown }).createdAt !== 'number'
  ) {
    return undefined
  }
  return {
    id: (record as { id: string }).id,
    cwd: (record as { cwd: string }).cwd,
    createdAt: (record as { createdAt: number }).createdAt,
  }
}

/** List every session under `$DSH_HOME/sessions`, newest first. */
export function listSessions(home: string = defaultHome()): readonly SessionSummary[] {
  const root = join(home, 'sessions')
  if (!existsSync(root)) return []
  const out: SessionSummary[] = []
  for (const source of readdirSync(root)) {
    const sourceDir = join(root, source)
    if (!statSync(sourceDir).isDirectory()) continue
    for (const id of readdirSync(sourceDir)) {
      if (!id.startsWith('session-')) continue
      const file = join(sourceDir, id, 'session.v3.jsonl.zstd')
      if (!existsSync(file)) continue
      const header = readHeader(file)
      if (header === undefined) continue
      out.push({
        id: header.id,
        sessionId: brandString<SessionId>(header.id),
        cwd: header.cwd,
        createdAt: header.createdAt,
        dir: join(sourceDir, id),
        source,
      })
    }
  }
  out.sort((a, b) => b.createdAt - a.createdAt)
  return out
}

/**
 * Narrow a session listing by the current working directory or an explicit
 * prefix. The default filter keeps any session whose `cwd` equals the target
 * OR is a descendant of it (a session opened in `/proj/sub` shows up in
 * listings from `/proj`, but not the other way around).
 */
export function filterSessions(
  summaries: readonly SessionSummary[],
  filter: { cwd?: string | undefined } = {},
): readonly SessionSummary[] {
  const want = filter.cwd ?? process.cwd()
  const wantAbs = isAbsolute(want) ? want : join(process.cwd(), want)
  return summaries.filter((s) => {
    if (s.cwd === wantAbs) return true
    const rel = relative(wantAbs, s.cwd)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
}

/**
 * Remove a session by id. The id is the `session-<uuid>` directory name; we
 * search every source bucket under `sessions/` for a matching directory.
 * Returns `true` when a directory was removed, `false` otherwise.
 */
export function deleteSession(id: string, home: string = defaultHome()): boolean {
  const root = join(home, 'sessions')
  if (!existsSync(root)) return false
  for (const source of readdirSync(root)) {
    const sourceDir = join(root, source)
    if (!statSync(sourceDir).isDirectory()) continue
    const target = join(sourceDir, id)
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true })
      return true
    }
  }
  return false
}

/** Format a `createdAt` epoch as `YYYY-MM-DD HH:MM` in local time. */
export function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return (
    `${d.getFullYear().toString()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}