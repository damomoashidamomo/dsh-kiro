/**
 * Session export / import — the `/chat save` + `/chat load` pair.
 *
 * kiro-cli exports the whole conversation state to a JSON file and can load it
 * back later (`✔ Exported chat session state to <path>`). dsh-kiro keeps its
 * sessions as append-only logs under
 * `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`, so the export is the
 * decoded event list plus the metadata needed to place it back in the store.
 *
 * The file is deliberately self-contained: a session restored from a backup
 * survives the original being deleted, or moving to another machine.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/session-export
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'

/** Marker written into every export; a load refuses anything else. */
export const EXPORT_FORMAT = 'dsh-kiro/session-export@1'

/** zstd frame magic — the store appends one frame per durable write. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Header record of a session log (first event of the first frame). */
interface SessionHeader {
  type: 'session'
  version: number
  id: string
  createdAt: number
  cwd: string
  isSeeded?: boolean
  delegationDepth?: number
  [key: string]: unknown
}

/** One durable event in a session log. */
export type SessionEvent = { type: string; [key: string]: unknown }

/** The JSON document `/chat save` writes and `/chat load` reads. */
export interface SessionExport {
  readonly format: typeof EXPORT_FORMAT
  /** Epoch ms when the export was taken. */
  readonly savedAt: number
  /** Session identity and the workspace it belonged to. */
  readonly session: {
    readonly id: string
    readonly createdAt: number
    readonly cwd: string
    /** One-line description shown in listings, when the log had one. */
    readonly title: string
  }
  /** Decoded log: header record first, then every dated event. */
  readonly events: readonly SessionEvent[]
  /** dsh-kiro version that produced the file (diagnostics only). */
  readonly exporter: string
}

/** Expand a leading `~` and resolve relative paths against `base`. */
export function resolveUserPath(input: string, base = process.cwd()): string {
  const trimmed = input.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? trimmed : resolve(base, trimmed)
}

/**
 * Decode every event of a session log.
 *
 * The log is an append log of CONCATENATED zstd frames and
 * `zstdDecompressSync` stops after the first one, so the frames have to be
 * split on the magic first. A torn tail frame is normal after a crash and is
 * skipped.
 */
export function readLogEvents(dir: string): SessionEvent[] {
  let raw: Buffer
  try {
    raw = readFileSync(join(dir, 'session.v3.jsonl.zstd'))
  } catch {
    return []
  }
  const starts: number[] = []
  for (let i = 0; i + 4 <= raw.length; i += 1) {
    if (raw.compare(ZSTD_MAGIC, 0, 4, i, i + 4) === 0) starts.push(i)
  }
  const events: SessionEvent[] = []
  for (let i = 0; i < starts.length; i += 1) {
    const begin = starts[i] as number
    const end = i + 1 < starts.length ? (starts[i + 1] as number) : raw.length
    let plain: string
    try {
      plain = zstdDecompressSync(raw.subarray(begin, end)).toString('utf8')
    } catch {
      continue
    }
    for (const line of plain.split('\n')) {
      if (line.trim() === '') continue
      try {
        const event = JSON.parse(line) as SessionEvent
        if (typeof event?.type === 'string') events.push(event)
      } catch {
        // A partially written line at the tail — skip it.
      }
    }
  }
  return events
}

/** Serialise a decided session into an export document. */
export function buildExport(options: {
  id: string
  createdAt: number
  cwd: string
  title: string
  events: readonly SessionEvent[]
  exporter: string
}): SessionExport {
  return {
    format: EXPORT_FORMAT,
    savedAt: Date.now(),
    session: {
      id: options.id,
      createdAt: options.createdAt,
      cwd: options.cwd,
      title: options.title,
    },
    events: options.events,
    exporter: options.exporter,
  }
}

/** Write the export, refusing to clobber an existing file unless forced. */
export function writeExportFile(path: string, payload: SessionExport, force: boolean): void {
  if (!force && existsSync(path)) {
    throw new Error(`文件已存在：${path}（加 --force 覆盖）`)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

/** Read and validate an export file. */
export function readExportFile(path: string): SessionExport {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`读不到文件：${path}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`不是合法的 JSON：${path}`)
  }
  const doc = parsed as Partial<SessionExport> | null
  if (doc === null || typeof doc !== 'object' || doc.format !== EXPORT_FORMAT) {
    throw new Error(`不是 dsh-kiro 导出的会话文件（缺少 ${EXPORT_FORMAT} 标记）：${path}`)
  }
  if (!Array.isArray(doc.events) || doc.events.length === 0) {
    throw new Error(`导出文件里没有事件：${path}`)
  }
  const header = doc.events[0] as SessionEvent | undefined
  if (header?.type !== 'session' || typeof header.id !== 'string') {
    throw new Error(`导出文件缺少会话头（第一条事件必须是 session）：${path}`)
  }
  return doc as SessionExport
}

/** Pick the id a restored session gets. */
export function restoreId(
  exportedId: string,
  taken: ReadonlySet<string>,
  mint: () => string,
): { id: string; reused: boolean } {
  if (!taken.has(exportedId)) return { id: exportedId, reused: true }
  return { id: mint(), reused: false }
}

/**
 * Materialise a session log for a restored export.
 *
 * One zstd frame per event, exactly like the platform's writer, and the header
 * rewritten to the id/cwd the restore decided on. Returns the session
 * directory, which the caller can then resume.
 */
export function writeRestoredLog(options: {
  dir: string
  id: string
  cwd: string
  createdAt: number
  events: readonly SessionEvent[]
}): string {
  const header: SessionHeader = {
    ...(options.events[0] as unknown as SessionHeader),
    type: 'session',
    id: options.id,
    createdAt: options.createdAt,
    cwd: options.cwd,
  }
  const rest = options.events.slice(1)
  const frames = [header, ...rest].map((event) =>
    zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`)))
  mkdirSync(options.dir, { recursive: true })
  writeFileSync(join(options.dir, 'session.v3.jsonl.zstd'), Buffer.concat(frames))
  return options.dir
}

/** Arguments of `/chat save` (kiro-cli shape: <PATH> [-f|--force]). */
export function parseSaveArgs(args: readonly string[]): { path?: string; force: boolean; help: boolean } {
  const force = args.some((arg) => arg === '-f' || arg === '--force')
  const help = args.some((arg) => arg === '-h' || arg === '--help')
  const path = args.find((arg) => !arg.startsWith('-'))
  return { path, force, help }
}
