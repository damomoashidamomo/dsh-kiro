import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { readSessionTitle, readSessionTitleAsync, listSessions, invalidateSessionCache } from '../src/utils/sessions'

/**
 * Titles come from the session log on disk. The store appends CONCATENATED
 * zstd frames (one per durable write) and `zstdDecompressSync` stops after the
 * first one, so a naive read sees only the header — which is exactly why every
 * row lost its 简介.
 */

let home = ''

/** Write a session whose log is a list of frames, each holding JSONL events. */
function writeSession(id: string, frames: unknown[][], createdAt = Date.now()): string {
  const source = '--tmp-ws--'
  const dir = join(home, 'sessions', source, id)
  mkdirSync(dir, { recursive: true })
  const encoded = frames.map((events) =>
    zstdCompressSync(Buffer.from(events.map((e) => JSON.stringify(e)).join('\n') + '\n')))
  writeFileSync(join(dir, 'session.v3.jsonl.zstd'), Buffer.concat(encoded))
  return dir
}

const header = (id: string, createdAt: number) =>
  ({ type: 'session', version: 3, id, createdAt, cwd: '/tmp/ws', isSeeded: false, delegationDepth: 0 })
const userMessage = (text: string, seq = 0) =>
  ({ type: 'user/message', seq, data: { content: [{ type: 'text', text }], source: { kind: 'user' }, role: 'user' } })

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-titles-'))
  process.env.DSH_HOME = home
  invalidateSessionCache()
})

afterEach(() => {
  delete process.env.DSH_HOME
  invalidateSessionCache()
  rmSync(home, { recursive: true, force: true })
})

describe('session titles from disk', () => {
  it('finds a title that lives in a later zstd frame', () => {
    const dir = writeSession('session-aaaa1111-0000-0000-0000-000000000000', [
      [header('session-aaaa1111-0000-0000-0000-000000000000', Date.now())],
      [userMessage('重构登录流程')],
      [{ type: 'session/title', seq: 1, data: { title: '登录重构' } }],
    ])
    expect(readSessionTitle(dir)).toEqual({ title: '登录重构', firstUser: '重构登录流程', commands: [] })
  })

  it('falls back to the first user message, ignoring injected context', () => {
    const dir = writeSession('session-bbbb2222-0000-0000-0000-000000000000', [
      [header('session-bbbb2222-0000-0000-0000-000000000000', Date.now())],
      [{ type: 'user/message', seq: 0, data: { content: [{ type: 'text', text: '系统注入' }], source: { kind: 'system' } } }],
      [userMessage('真正的问题', 1)],
    ])
    expect(readSessionTitle(dir).title).toBe('')
    expect(readSessionTitle(dir).firstUser).toBe('真正的问题')
  })

  it('prefers the durable title over the user message', () => {
    const dir = writeSession('session-cccc3333-0000-0000-0000-000000000000', [
      [header('session-cccc3333-0000-0000-0000-000000000000', Date.now())],
      [userMessage('很长的一条用户消息')],
      [{ type: 'session/title', seq: 1, data: { title: '短标题' } }],
    ])
    const result = readSessionTitle(dir)
    expect(result.title).toBe('短标题')
    expect(result.firstUser).toBe('很长的一条用户消息')
  })

  it('survives a torn tail frame and an unreadable file', () => {
    const id = 'session-dddd4444-0000-0000-0000-000000000000'
    const dir = writeSession(id, [[header(id, Date.now())], [userMessage('首条消息')]])
    const file = join(dir, 'session.v3.jsonl.zstd')
    const raw = require('node:fs').readFileSync(file) as Buffer
    writeFileSync(file, Buffer.concat([raw, Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x01, 0x02])]))
    expect(readSessionTitle(dir).firstUser).toBe('首条消息')
    const empty = join(home, 'nope')
    mkdirSync(empty, { recursive: true })
    expect(readSessionTitle(empty)).toEqual({ title: '', firstUser: '', commands: [] })
  })

  it('flattens a multi-line message into one readable line', () => {
    const dir = writeSession('session-eeee5555-0000-0000-0000-000000000000', [
      [header('session-eeee5555-0000-0000-0000-000000000000', Date.now())],
      [userMessage('第一行\n\n第二行   带空格')],
    ])
    expect(readSessionTitle(dir).firstUser).toBe('第一行 第二行 带空格')
  })

  it('truncates a very long message with an ellipsis', () => {
    const dir = writeSession('session-ffff6666-0000-0000-0000-000000000000', [
      [header('session-ffff6666-0000-0000-0000-000000000000', Date.now())],
      [userMessage('长'.repeat(200))],
    ])
    const first = readSessionTitle(dir).firstUser
    expect(first.endsWith('…')).toBe(true)
    expect([...first].length).toBeLessThanOrEqual(48)
  })

  it('matches the async reader (the path the picker actually uses)', async () => {
    const id = 'session-9999aaaa-0000-0000-0000-000000000000'
    const dir = writeSession(id, [
      [header(id, Date.now())],
      [userMessage('异步读取')],
      [{ type: 'session/title', seq: 1, data: { title: '异步标题' } }],
    ])
    expect(await readSessionTitleAsync(dir)).toEqual(readSessionTitle(dir))
  })

  it('lists a session that lives in the store', () => {
    const id = 'session-7777bbbb-0000-0000-0000-000000000000'
    writeSession(id, [[header(id, Date.now())], [userMessage('列出我')]])
    expect(listSessions(home).map((row) => row.id)).toContain(id)
  })
})

describe('command-only sessions', () => {
  const command = (name: string, args: string, seq: number) =>
    ({ type: 'command/run', seq, data: { name, args, source: { kind: 'user' } } })

  it('collects the commands a message-less session ran', () => {
    const id = 'session-c0mmand1-0000-0000-0000-000000000000'
    const dir = writeSession(id, [
      [header(id, Date.now())],
      [command('chat', 'list', 0), command('model', '', 1)],
      [command('chat', 'list', 2)], // repeated → deduped
    ])
    const result = readSessionTitle(dir)
    expect(result.commands).toEqual(['/chat list', '/model'])
    expect(result.firstUser).toBe('')
  })

  it('caps the list at three commands', () => {
    const id = 'session-c0mmand2-0000-0000-0000-000000000000'
    const dir = writeSession(id, [
      [header(id, Date.now())],
      [command('a', '', 0), command('b', '', 1), command('c', '', 2), command('d', '', 3)],
    ])
    expect(readSessionTitle(dir).commands).toEqual(['/a', '/b', '/c'])
  })

  it('keeps a real title ahead of the commands', () => {
    const id = 'session-c0mmand3-0000-0000-0000-000000000000'
    const dir = writeSession(id, [
      [header(id, Date.now())],
      [command('chat', 'list', 0)],
      [{ type: 'session/title', seq: 1, data: { title: '命令会话也有标题' } }],
    ])
    const result = readSessionTitle(dir)
    expect(result.title).toBe('命令会话也有标题')
    expect(result.commands).toEqual(['/chat list'])
  })
})
