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
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { zstdDecompress, zstdDecompressSync } from 'node:zlib'
import { promisify } from 'node:util'
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

/** Promise-based single-frame zstd decode (yields to the event loop). */
const decompress = promisify(zstdDecompress)

/** zstd frame magic — the store appends one frame per durable write. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** How many slash commands a command-only session row lists. */
const MAX_COMMANDS = 3

/** Longest summary a row can show. */
const SUMMARY_WIDTH = 48

/** What the picker shows for a session: a title, else the first user message. */
export interface SessionTitle {
  readonly title: string
  readonly firstUser: string
  /**
   * Slash commands the session ran (`/chat list`), in order, deduped. A session
   * that only ever ran commands has neither a title nor a message — the
   * commands are then the only thing that tells one such session from another.
   */
  readonly commands: readonly string[]
}

/** Trim a summary candidate to one readable line. */
function tidy(text: string, limit = SUMMARY_WIDTH): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

/** `ZSTD` frame offsets in a byte buffer (append logs are frame-concatenated). */
function frameOffsets(raw: Buffer): number[] {
  const starts: number[] = []
  for (let i = 0; i + 4 <= raw.length; i += 1) {
    if (raw.compare(ZSTD_MAGIC, 0, 4, i, i + 4) === 0) starts.push(i)
  }
  return starts
}

/** Empty accumulator. */
function emptyTitle(): { title: string; firstUser: string; commands: string[] } {
  return { title: '', firstUser: '', commands: [] }
}

/** True once the summary is settled (nothing else in the log can improve it). */
function settled(acc: { title: string; firstUser: string; commands: string[] }): boolean {
  return acc.title !== '' && acc.firstUser !== '' && acc.commands.length >= MAX_COMMANDS
}

/**
 * Pull the summary candidates out of one decompressed frame's JSONL text.
 *
 * Preference in the row: `session/title` (session-title-llm summarizes with the
 * model and logs it durably), then the first real user message, then the
 * commands the session ran. System-injected messages are skipped — they are the
 * harness talking, not the user.
 */
function foldFrame(
  frame: string,
  current: { title: string; firstUser: string; commands: string[] },
): { title: string; firstUser: string; commands: string[] } {
  let { title, firstUser } = current
  const commands = [...current.commands]
  for (const line of frame.split('\n')) {
    if (line.trim() === '') continue
    if (settled({ title, firstUser, commands })) break
    let event: { type?: unknown; data?: unknown }
    try {
      event = JSON.parse(line) as { type?: unknown; data?: unknown }
    } catch {
      continue
    }
    const type = event.type
    if (type === 'session/title') {
      const value = (event.data as { title?: unknown } | undefined)?.title
      if (typeof value === 'string' && value.trim() !== '') title = tidy(value)
      continue
    }
    if (type === 'command/run') {
      const data = event.data as { name?: unknown; args?: unknown } | undefined
      const name = typeof data?.name === 'string' ? data.name.trim() : ''
      const args = typeof data?.args === 'string' ? data.args.trim() : ''
      const label = name === '' ? '' : `/${name}${args === '' ? '' : ` ${args}`}`
      if (label !== '' && !commands.includes(label) && commands.length < MAX_COMMANDS) commands.push(label)
      continue
    }
    if (firstUser !== '' || type !== 'user/message') continue
    const data = event.data as { content?: unknown; source?: { kind?: unknown } } | undefined
    if (data?.source?.kind !== 'user' || !Array.isArray(data.content)) continue
    for (const part of data.content) {
      const text = part as { type?: unknown; text?: unknown } | undefined
      if (text?.type === 'text' && typeof text.text === 'string' && text.text.trim() !== '') {
        firstUser = tidy(text.text)
        break
      }
    }
  }
  return { title, firstUser, commands }
}

/**
 * Read a session's summary straight from its log file.
 *
 * This deliberately does NOT go through the platform's session query: its
 * persistence listing refuses to load ANY log once the store contains a
 * duplicate session id ("appears in multiple project directories") or a log
 * whose tail fails validation, which silently removed every title from the
 * /chat menu and from `/chat list`. Reading the file we already located keeps
 * the listing working whatever shape the store is in.
 *
 * The log is an APPEND log of concatenated zstd frames, and
 * `zstdDecompressSync` stops after the first one — so a single call would only
 * ever see the header. Split on the magic and decode frame by frame; `maxBytes`
 * bounds the work on logs that ran for hours.
 */
export function readSessionTitle(dir: string, maxBytes = 2_000_000): SessionTitle {
  let raw: Buffer
  try {
    raw = readFileSync(join(dir, 'session.v3.jsonl.zstd'))
  } catch {
    return emptyTitle()
  }
  const starts = frameOffsets(raw)
  let acc = emptyTitle()
  let used = 0
  for (let i = 0; i < starts.length; i += 1) {
    const begin = starts[i] as number
    const end = i + 1 < starts.length ? (starts[i + 1] as number) : raw.length
    let plain: string
    try {
      plain = zstdDecompressSync(raw.subarray(begin, end)).toString('utf8')
    } catch {
      // A torn tail frame is normal (crash mid-write) — keep what parsed.
      continue
    }
    used += plain.length
    acc = foldFrame(plain, acc)
    if (settled(acc) || used >= maxBytes) break
  }
  return acc
}

/**
 * Async twin of {@link readSessionTitle}. Summaries are read while the /chat
 * menu is already on screen, so the scan must not block the Ink event loop:
 * every frame decode is awaited (yielding between frames) and the file itself
 * is read through `fs/promises`.
 */
export async function readSessionTitleAsync(dir: string, maxBytes = 2_000_000): Promise<SessionTitle> {
  let raw: Buffer
  try {
    raw = await readFile(join(dir, 'session.v3.jsonl.zstd'))
  } catch {
    return emptyTitle()
  }
  const starts = frameOffsets(raw)
  let acc = emptyTitle()
  let used = 0
  for (let i = 0; i < starts.length; i += 1) {
    const begin = starts[i] as number
    const end = i + 1 < starts.length ? (starts[i + 1] as number) : raw.length
    let plain: string
    try {
      plain = (await decompress(raw.subarray(begin, end))).toString('utf8')
    } catch {
      continue
    }
    used += plain.length
    acc = foldFrame(plain, acc)
    if (settled(acc) || used >= maxBytes) break
  }
  return acc
}

/** List every session under `$DSH_HOME/sessions`, newest first. */
/** Short-lived cache: a picker open lists sessions more than once. */
const LISTING_TTL_MS = 5000
const listingCache = new Map<string, { at: number; rows: readonly SessionSummary[] }>()

/** Drop the cached listing (after a delete, or in tests). */
export function invalidateSessionCache(): void {
  listingCache.clear()
}

export function listSessions(home: string = defaultHome()): readonly SessionSummary[] {
  const cached = listingCache.get(home)
  if (cached !== undefined && Date.now() - cached.at < LISTING_TTL_MS) return cached.rows
  const rows = scanSessions(home)
  listingCache.set(home, { at: Date.now(), rows })
  return rows
}

function scanSessions(home: string): readonly SessionSummary[] {
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
  invalidateSessionCache()
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