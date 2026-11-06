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
import {
  deleteSession,
  filterSessions,
  formatTimestamp,
  listSessions,
} from '../utils/sessions'

interface SessionSwitchService {
  switchTo(target: string | undefined): Promise<{ ok: boolean; message: string }>
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
 * Best-effort one-line description of a session: the platform's
 * `session/title` event (session-title-llm summarizes with the model and
 * logs it durably), falling back to the first user message excerpt. Reads
 * run through sessionQuery.readSession; failures just yield no title.
 */
async function loadTitles(agentCtx: unknown, ids: readonly string[], limit = 10): Promise<Map<string, string>> {
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
  const titles = new Map<string, string>()
  if (readSession === undefined) return titles
  await Promise.all(ids.slice(0, limit).map(async (id) => {
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
      const clipped = clipTitle(title !== '' ? title : firstUser)
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

/** Short resume hint when no id was given: the recent sessions for this cwd. */
async function resumeHint(agent: unknown): Promise<string> {
  const rows = filterSessions(listSessions()).slice(0, 5)
  const lines = ['usage: /chat resume <session-id>  —  在当前 TUI 内直接切换，无需重启']
  if (rows.length === 0) {
    lines.push('（当前目录还没有历史会话；/chat list --all 查看全部）')
    return lines.join('\n')
  }
  const titles = await loadTitles(agent, rows.map((r) => r.id))
  lines.push('当前目录最近的会话：')
  for (const row of rows) {
    const title = titles.get(row.id)
    lines.push(`  ${row.id}  ${formatTimestamp(row.createdAt)}  ${title ?? ''}`.trimEnd())
  }
  return lines.join('\n')
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
        const titles = await loadTitles(agent, filtered.slice(0, 10).map((r) => r.id))
        return { kind: 'success', text: listText(filtered, { all, titles }) }
      }
      case 'resume': {
        const id = args[0]
        if (id === undefined) return { kind: 'success', text: await resumeHint(agent) }
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
      case 'help':
        return { kind: 'success', text: '/chat <list|resume|new|delete> [args]\n  list [--all]        list sessions for this cwd (or all with --all)\n  resume <id>         在当前 TUI 内切换到该会话（回放最近 300 条事件）\n  new                 存盘当前会话并开启新会话\n  delete <id>         删除一个存盘会话' }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /chat help.` }
    }
  },
}

export { listText }
