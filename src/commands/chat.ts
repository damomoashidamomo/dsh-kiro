/**
 * `/chat` — manage saved sessions: list, resume, switch, delete.
 *
 * Reads headers directly from `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`
 * via {@link import('../utils/sessions').listSessions}, which keeps the
 * dependency surface narrow (no `dsh-session-query-sqlite` plumbing). By
 * default the listing only shows sessions whose working directory matches
 * (or is a parent of) the current `cwd` — most users only want their own
 * recent sessions.
 *
 * `resume`/`new` switch sessions IN PLACE through the `kiroSessionSwitch`
 * service (flush + dispose + agents.resume/create + transcript replay) —
 * no exit/restart needed. `--resume`/`--resume-id` remain boot-time
 * equivalents handled by `startup.ts` + the runtime mount.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  deleteSession,
  filterSessions,
  formatTimestamp,
  invalidateSessionCache,
  listSessions,
  readSessionTitleAsync,
  sessionSourceDir,
} from '../utils/sessions'
import {
  buildExport,
  parseSaveArgs,
  readExportFile,
  readLogEvents,
  resolveUserPath,
  restoreId,
  writeExportFile,
  writeRestoredLog,
} from '../utils/session-export'

interface SessionSwitchService {
  switchTo(target: string | undefined): Promise<{ ok: boolean; message: string }>
}

/** `dsh-kiro@<version>`, recorded inside every export for diagnostics. */
function exporterLabel(): string {
  try {
    const require = createRequire(import.meta.url)
    const version = (require('../../package.json') as { version?: string }).version
    return version === undefined ? 'dsh-kiro' : `dsh-kiro@${version}`
  } catch {
    return 'dsh-kiro'
  }
}

/** Runtime facts the export needs: the live session id, and a clean store. */
interface SessionInfoService {
  currentId(): string | undefined
  flush(): Promise<void>
}

function serviceOf<T>(agentCtx: unknown, name: string): T | undefined {
  const ctx = (agentCtx as { ctx?: unknown }).ctx
  if (ctx === undefined || ctx === null) return undefined
  const get = (ctx as { get?: (name: string) => unknown }).get
  return typeof get === 'function' ? get.call(ctx, name) as T | undefined : undefined
}

function switchServiceOf(agentCtx: unknown): SessionSwitchService | undefined {
  const ctx = (agentCtx as { ctx?: unknown }).ctx
  if (ctx === undefined || ctx === null) return undefined
  const get = (ctx as { get?: (name: string) => unknown }).get
  return typeof get === 'function'
    ? get.call(ctx, 'kiroSessionSwitch') as SessionSwitchService | undefined
    : undefined
}

/** Truncate a title for one-line display (width-aware for CJK). */
function clipTitle(title: string, maxUnits = 48): string {
  const oneLine = title.replace(/\s+/gu, ' ').trim()
  if (oneLine === '') return ''
  let units = 0
  let out = ''
  for (const ch of oneLine) {
    const w = ch.charCodeAt(0) > 0xff ? 2 : 1
    if (units + w > maxUnits - 1) return `${out}…`
    units += w
    out += ch
  }
  return out
}

/**
 * One-line description for a session row.
 *
 * Order: the durable title, then the first user message, then — for a session
 * that only ever ran slash commands (no message at all) — the commands it ran,
 * because a bare timestamp cannot tell two of those apart.
 */
export function summaryOf(session: { title: string; firstUser: string; commands: readonly string[] }): string {
  if (session.title !== '') return clipTitle(session.title)
  if (session.firstUser !== '') return clipTitle(session.firstUser)
  if (session.commands.length > 0) return clipTitle(`命令 ${session.commands.join(' · ')}`)
  return ''
}

/**
 * Best-effort one-line description of a session: the durable `session/title`
 * event (session-title-llm summarizes with the model), falling back to the
 * first user message excerpt.
 *
 * The log is read STRAIGHT FROM DISK (`readSessionTitle`). Going through the
 * platform's session query looked cleaner, but its persistence listing refuses
 * to load any log when the store holds a duplicate session id ("appears in
 * multiple project directories") or a log whose tail fails validation — and
 * then every row silently lost its title. The platform reader stays as a
 * second chance for whatever the file did not answer (forks, live sessions).
 */
async function loadTitles(agentCtx: unknown, ids: readonly string[], limit = 10): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const wanted = ids.slice(0, limit)
  const dirs = new Map(listSessions().map((row) => [row.id, row.dir]))
  const unresolved: string[] = []
  // Scan the logs concurrently but off the render path: readSessionTitleAsync
  // awaits each frame, so the menu keeps repainting while titles stream in.
  const scanned = await Promise.all(wanted.map(async (id) => {
    const dir = dirs.get(id)
    if (dir === undefined) return { id, clipped: '' }
    return { id, clipped: summaryOf(await readSessionTitleAsync(dir)) }
  }))
  for (const { id, clipped } of scanned) {
    if (clipped !== '') titles.set(id, clipped)
    else unresolved.push(id)
  }
  if (unresolved.length === 0) return titles

  // Through the runtime-provided bridge (see kiro-runtime index.tsx): a
  // direct agent-scope ctx.get('sessionQuery') hits a cordis shadow proxy
  // that breaks the engine's receiver.
  const ctx = (agentCtx as { ctx?: unknown }).ctx
  const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
  const readSession = typeof get === 'function'
    ? (get.call(ctx, 'kiroSessionReader') as
      | { readSession?: (id: string) => Promise<{ events: ReadonlyArray<{ type: string; data: unknown }> }> }
      | undefined)?.readSession
    : undefined
  if (readSession === undefined) return titles
  await Promise.all(unresolved.map(async (id) => {
    try {
      const snapshot = await readSession(id)
      let title = ''
      let firstUser = ''
      for (const event of snapshot.events ?? []) {
        if (event.type === 'session/title') {
          const data = event.data as { title?: unknown }
          if (typeof data?.title === 'string' && data.title.trim() !== '') title = data.title
        }
        if (firstUser === '' && event.type === 'user/message') {
          const data = event.data as { content?: unknown[]; source?: { kind?: string } }
          if (data?.source?.kind === 'user' && Array.isArray(data.content)) {
            const text = data.content
              .filter((c): c is { type: 'text'; text: string } => typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text')
              .map((c) => c.text)
              .join(' ')
              .trim()
            if (text !== '') firstUser = text
          }
        }
      }
      const clipped = summaryOf({ title, firstUser, commands: [] })
      if (clipped !== '') titles.set(id, clipped)
    } catch {
      // unreadable log — no title for this row
    }
  }))
  return titles
}

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'list', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'list', args: tokens.slice(1) }
}

/** Render the listing table: one line per session, id · date · summary. */
function listText(rows: ReadonlyArray<{
  id: string; cwd: string; createdAt: number
}>, opts: { all: boolean; titles?: ReadonlyMap<string, string> }): string {
  if (rows.length === 0) {
    return opts.all
      ? '(no sessions under $DSH_HOME/sessions)'
      : '(no sessions for the current working directory — pass `--all` to see every session on disk)'
  }
  const header = `${rows.length.toString().padStart(4)} session(s):`
  const lines: string[] = [header]
  for (const row of rows.slice(0, 50)) {
    const date = formatTimestamp(row.createdAt)
    const title = opts.titles?.get(row.id) ?? ''
    const tail = title !== ''
      ? (opts.all ? `${title}  ${row.cwd}` : title)
      : (opts.all ? row.cwd : '')
    lines.push(`  ${row.id.padEnd(40)}  ${date}  ${tail}`.trimEnd())
  }
  if (rows.length > 50) lines.push(`  … and ${rows.length - 50} more`)
  return lines.join('\n')
}

/**
 * Hint for `/chat resume` without an id.
 *
 * It used to re-print the five most recent sessions, which duplicated the table
 * `/chat list` already prints. Point at the two ways to pick a session instead.
 */
export function resumeHint(): string {
  return [
    'usage: /chat resume <session-id>  —  在当前 TUI 内直接切换，无需重启',
    '  不知道 id？/chat list 看全部；直接 /chat ⏎ 菜单里也能选（最近 ' + PICKER_SESSIONS + ' 个）',
  ].join('\n')
}

/** How many recent sessions the option menu offers (before height fitting). */
export const PICKER_SESSIONS = 20

/**
 * Bridge for the /chat option menu: recent sessions for this cwd.
 *
 * Titles are NOT loaded here (that is async); the picker shows the id and
 * patch-in titles arrive through {@link chatTitlesBridge}. It used to hand
 * back `title: ''` for every row, which is why the menu always said
 * 「（无简介）」.
 */
export function chatListBridge(): {
  /** Total sessions matching the cwd (the menu shows only the newest). */
  total: number
  sessions: readonly { id: string; title: string; when: string }[]
} {
  const rows = filterSessions(listSessions())
  return {
    total: rows.length,
    // `when` is the fallback the row shows until the title resolves (and
    // forever for a session that never got one).
    sessions: rows
      .slice(0, PICKER_SESSIONS)
      .map((row) => ({ id: row.id, title: '', when: formatTimestamp(row.createdAt) })),
  }
}

/**
 * Load the one-line titles for the sessions the option menu shows, keyed by
 * id (`session/title`, falling back to the first user message). An empty map
 * means the reader is unavailable — the rows then show the timestamp only.
 */
export async function chatTitlesBridge(runtimeCtx: unknown, ids: readonly string[]): Promise<Map<string, string>> {
  return loadTitles({ ctx: runtimeCtx }, ids, PICKER_SESSIONS)
}

const SAVE_USAGE = [
  'Usage: /chat save <PATH> [-f|--force]',
  '',
  'Arguments:',
  '  <PATH>  Path where the chat session will be saved',
  '',
  'Options:',
  '  -f, --force  Force overwrite if file already exists',
  '  -h, --help   Print help',
].join('\n')

const LOAD_USAGE = [
  'Usage: /chat load <PATH> [--no-continue]',
  '',
  'Arguments:',
  '  <PATH>  Path to the chat session file to load',
  '',
  'Options:',
  '  --no-continue  Restore without asking the model to continue',
  '  -h, --help     Print help',
].join('\n')

export const chatCommand: CommandDefinition = {
  name: 'chat',
  description: 'Manage sessions: list, resume, switch, delete',
  input: { hint: '<list|resume|new|delete> [args]' },
  handler: async ({ agent, rawInput }) => {
    const { name: sub, args } = parseSubcommand(rawInput)
    switch (sub) {
      case 'new': {
        const service = switchServiceOf(agent)
        if (service === undefined) {
          return { kind: 'error', text: '/chat new: 会话切换服务不可用' }
        }
        const result = await service.switchTo(undefined)
        return result.ok
          ? { kind: 'success', text: '◇ 已开启新会话。' }
          : { kind: 'error', text: result.message }
      }
      case 'list':
      case '': {
        const all = args.includes('--all')
        const summaries = listSessions()
        const filtered = all ? summaries : filterSessions(summaries)
        // The table prints up to 50 rows; load a summary for ALL of them (it
        // used to stop at 10, so later rows showed nothing even when titled).
        const titles = await loadTitles(agent, filtered.slice(0, 50).map((r) => r.id), 50)
        return { kind: 'success', text: listText(filtered, { all, titles }) }
      }
      case 'resume': {
        const id = args[0]
        if (id === undefined) return { kind: 'success', text: resumeHint() }
        const service = switchServiceOf(agent)
        if (service === undefined) {
          return { kind: 'error', text: '/chat resume: 会话切换服务不可用' }
        }
        const result = await service.switchTo(id)
        return result.ok
          ? { kind: 'success', text: result.message }
          : { kind: 'error', text: result.message }
      }
      case 'delete': {
        const target = args[0]
        if (target === undefined) return { kind: 'success', text: 'usage: /chat delete <session-id>' }
        const removed = deleteSession(target)
        return removed
          ? { kind: 'success', text: `deleted session ${target}` }
          : { kind: 'error', text: `no session found for "${target}"` }
      }
      case 'save': {
        // kiro-cli shape: /chat save <PATH> [-f|--force]
        const parsed = parseSaveArgs(args)
        if (parsed.help) return { kind: 'success', text: SAVE_USAGE }
        if (parsed.path === undefined) {
          return { kind: 'error', text: `error: the following required arguments were not provided:\n  <PATH>\n\n${SAVE_USAGE}` }
        }
        const info = serviceOf<SessionInfoService>(agent, 'kiroSessionInfo')
        const currentId = info?.currentId()
        if (currentId === undefined) {
          return { kind: 'error', text: '/chat save: 拿不到当前会话 id（运行时未就绪）' }
        }
        const summaryRow = listSessions().find((row) => row.id === currentId)
        if (summaryRow === undefined) {
          return { kind: 'error', text: `/chat save: 当前会话 ${currentId} 还不在磁盘上（先发一条消息）` }
        }
        // Flush first: the log on disk lags the live transcript until a write
        // lands, and the export reads the log.
        await info?.flush()
        const events = readLogEvents(summaryRow.dir)
        if (events.length === 0) {
          return { kind: 'error', text: `/chat save: ${summaryRow.dir} 里读不到事件` }
        }
        const { title, firstUser, commands } = await readSessionTitleAsync(summaryRow.dir)
        const target = resolveUserPath(parsed.path)
        try {
          writeExportFile(target, buildExport({
            id: currentId,
            createdAt: summaryRow.createdAt,
            cwd: summaryRow.cwd,
            title: summaryOf({ title, firstUser, commands }),
            events,
            exporter: exporterLabel(),
          }), parsed.force)
        } catch (error) {
          return { kind: 'error', text: `/chat save: ${error instanceof Error ? error.message : String(error)}` }
        }
        return {
          kind: 'success',
          text: [
            `✔ 已导出会话状态到 ${target}`,
            `  事件 ${events.length} 条 · 会话 ${currentId}`,
            `  以后恢复用：/chat load ${target}`,
          ].join('\n'),
        }
      }
      case 'load': {
        const flagless = args.filter((arg) => !arg.startsWith('-'))
        const target = flagless[0]
        if (target === undefined) {
          return { kind: 'error', text: `error: the following required arguments were not provided:\n  <PATH>\n\n${LOAD_USAGE}` }
        }
        const noContinue = args.includes('--no-continue')
        const path = resolveUserPath(target)
        let doc
        try {
          doc = readExportFile(path)
        } catch (error) {
          return { kind: 'error', text: `/chat load: ${error instanceof Error ? error.message : String(error)}` }
        }
        const service = switchServiceOf(agent)
        if (service === undefined) {
          return { kind: 'error', text: '/chat load: 会话切换服务不可用' }
        }
        // Reuse the exported id when it is free; a second session with the same
        // id in another project dir breaks the platform's whole store listing.
        const taken = new Set(listSessions().map((row) => row.id))
        const { id, reused } = restoreId(doc.session.id, taken, () => `session-${randomUUID()}`)
        const cwd = process.cwd()
        const createdAt = reused ? doc.session.createdAt : Date.now()
        const dir = join(sessionSourceDir(cwd), id)
        try {
          writeRestoredLog({ dir, id, cwd, createdAt, events: doc.events })
        } catch (error) {
          return { kind: 'error', text: `/chat load: 写入会话日志失败：${error instanceof Error ? error.message : String(error)}` }
        }
        invalidateSessionCache()
        const switched = await service.switchTo(id)
        if (!switched.ok) {
          return { kind: 'error', text: `/chat load: ${switched.message}` }
        }
        const notes = [
          `✔ 已从 ${path} 恢复会话`,
          `  ${reused ? `沿用原会话 id ${id}` : `原 id ${doc.session.id} 已存在，改用新 id ${id}`}`,
          `  事件 ${doc.events.length} 条 · 导出时间 ${formatTimestamp(doc.savedAt)}`,
        ]
        // kiro-cli re-drives the conversation right after a load; `--no-continue`
        // keeps the restored transcript quiet if the user would rather look first.
        if (!noContinue) {
          const send = serviceOf<{ submit(text: string): void }>(agent, 'kiroRetry')
          if (send !== undefined) {
            notes.push('  继续对话：已自动接着聊（--no-continue 可关闭）')
            setTimeout(() => send.submit('继续'), 0)
          }
        }
        return { kind: 'success', text: notes.join('\n') }
      }
      case 'help':
        return {
          kind: 'success',
          text: [
            '/chat <list|resume|new|save|load|delete> [args]',
            '  list [--all]        list sessions for this cwd (or all with --all)',
            '  resume <id>         在当前 TUI 内切换到该会话（回放最近 300 条事件）',
            '  new                 存盘当前会话并开启新会话',
            '  save <path> [-f]    把当前会话导出成自包含 JSON（-f 覆盖同名文件）',
            '  load <path>         从 JSON 恢复会话（默认自动接着聊，--no-continue 关闭）',
            '  delete <id>         删除一个存盘会话',
          ].join('\n'),
        }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /chat help.` }
    }
  },
}

export { listText }
