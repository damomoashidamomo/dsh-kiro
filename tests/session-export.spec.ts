import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import {
  EXPORT_FORMAT,
  buildExport,
  parseSaveArgs,
  readExportFile,
  readLogEvents,
  resolveUserPath,
  restoreId,
  writeExportFile,
  writeRestoredLog,
  type SessionEvent,
} from '../src/utils/session-export'
import { readSessionTitle } from '../src/utils/sessions'

/**
 * `/chat save` + `/chat load` (kiro-cli parity). The export must be
 * self-contained — a session restored from a backup has to survive the original
 * being deleted — and the restored log must be a valid v3 append log so the
 * platform can resume it.
 */

let dir = ''

/** Write a session log the way the store does: one zstd frame per append. */
function writeLog(path: string, frames: readonly unknown[][]): string {
  mkdirSync(path, { recursive: true })
  const encoded = frames.map((events) =>
    zstdCompressSync(Buffer.from(events.map((e) => JSON.stringify(e)).join('\n') + '\n')))
  const file = join(path, 'session.v3.jsonl.zstd')
  writeFileSync(file, Buffer.concat(encoded))
  return file
}

const header = (id: string, createdAt = 1793000000000) =>
  ({ type: 'session', version: 3, id, createdAt, cwd: '/tmp/ws', isSeeded: false, delegationDepth: 0 })
const userMessage = (text: string, seq = 0) =>
  ({ type: 'user/message', seq, data: { content: [{ type: 'text', text }], source: { kind: 'user' }, role: 'user' } })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-export-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('path handling', () => {
  it('expands ~ and resolves relative paths', () => {
    expect(resolveUserPath('~/x.json').endsWith('/x.json')).toBe(true)
    expect(resolveUserPath('~/x.json').startsWith('/')).toBe(true)
    expect(resolveUserPath('sub/x.json', '/base')).toBe('/base/sub/x.json')
    expect(resolveUserPath('/abs/x.json')).toBe('/abs/x.json')
  })
})

describe('reading the log', () => {
  it('decodes EVERY frame, not just the first', () => {
    const session = join(dir, 'session-a')
    writeLog(session, [[header('session-a')], [userMessage('第一帧')], [userMessage('第二帧', 1)]])
    const events = readLogEvents(session)
    expect(events).toHaveLength(3)
    expect(events.map((e) => e.type)).toEqual(['session', 'user/message', 'user/message'])
  })

  it('skips a torn tail frame and an unreadable dir', () => {
    const session = join(dir, 'session-b')
    const file = writeLog(session, [[header('session-b')], [userMessage('ok')]])
    writeFileSync(file, Buffer.concat([
      readFileSync(file) as Buffer,
      Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x01, 0x02]),
    ]))
    expect(readLogEvents(session)).toHaveLength(2)
    expect(readLogEvents(join(dir, 'nope'))).toEqual([])
  })
})

describe('export file', () => {
  const events: SessionEvent[] = [header('session-x') as SessionEvent, userMessage('导出我') as SessionEvent]

  it('writes the format marker and refuses to clobber without --force', () => {
    const path = join(dir, 'save.json')
    writeExportFile(path, buildExport({ id: 'session-x', createdAt: 1, cwd: '/tmp/ws', title: '导出我', events, exporter: 'dsh-kiro@test' }), false)
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    expect(doc.format).toBe(EXPORT_FORMAT)
    expect(doc.session).toMatchObject({ id: 'session-x', cwd: '/tmp/ws', title: '导出我' })
    expect(doc.events).toHaveLength(2)
    expect(() => writeExportFile(path, buildExport({ id: 'session-x', createdAt: 1, cwd: '/tmp/ws', title: '', events, exporter: 'x' }), false))
      .toThrow(/已存在/u)
    expect(() => writeExportFile(path, buildExport({ id: 'session-x', createdAt: 1, cwd: '/tmp/ws', title: '', events, exporter: 'x' }), true))
      .not.toThrow()
  })

  it('rejects a file that is not an export, bad JSON, or empty', () => {
    const notExport = join(dir, 'other.json')
    writeFileSync(notExport, JSON.stringify({ hello: 'world' }))
    expect(() => readExportFile(notExport)).toThrow(/不是 dsh-kiro 导出的会话文件/u)
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{oops')
    expect(() => readExportFile(bad)).toThrow(/合法的 JSON/u)
    const empty = join(dir, 'empty.json')
    writeFileSync(empty, JSON.stringify({ format: EXPORT_FORMAT, events: [] }))
    expect(() => readExportFile(empty)).toThrow(/没有事件/u)
    expect(() => readExportFile(join(dir, 'missing.json'))).toThrow(/读不到文件/u)
  })

  it('round-trips an export', () => {
    const path = join(dir, 'rt.json')
    writeExportFile(path, buildExport({ id: 'session-x', createdAt: 7, cwd: '/tmp/ws', title: 't', events, exporter: 'e' }), false)
    const doc = readExportFile(path)
    expect(doc.session.id).toBe('session-x')
    expect(doc.events[0]?.type).toBe('session')
  })
})

describe('id decision', () => {
  it('reuses a free id and mints one when taken', () => {
    expect(restoreId('session-a', new Set(), () => 'session-new')).toEqual({ id: 'session-a', reused: true })
    expect(restoreId('session-a', new Set(['session-a']), () => 'session-new')).toEqual({ id: 'session-new', reused: false })
  })
})

describe('restored log', () => {
  it('lands a resumable v3 log with a patched header', () => {
    const source = join(dir, 'source')
    writeLog(source, [[header('session-old')], [userMessage('原始对话')], [userMessage('接着说', 1)]])
    const doc = buildExport({ id: 'session-old', createdAt: 1, cwd: '/tmp/ws', title: '', events: readLogEvents(source), exporter: 'e' })

    const target = join(dir, 'restored', 'session-new')
    writeRestoredLog({ dir: target, id: 'session-new', cwd: '/tmp/other', createdAt: 42, events: doc.events })

    expect(existsSync(join(target, 'session.v3.jsonl.zstd'))).toBe(true)
    const events = readLogEvents(target)
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({ type: 'session', id: 'session-new', cwd: '/tmp/other', createdAt: 42, version: 3 })
    // The conversation itself is preserved verbatim.
    expect(events.slice(1)).toEqual(doc.events.slice(1))
    // And the title reader agrees, so the restored row gets a summary.
    expect(readSessionTitle(target).firstUser).toBe('原始对话')
  })

  it('survives the original being deleted (self-contained)', () => {
    const source = join(dir, 'source2')
    writeLog(source, [[header('session-gone')], [userMessage('这条对话要留档')]])
    const path = join(dir, 'backup.json')
    writeExportFile(path, buildExport({ id: 'session-gone', createdAt: 1, cwd: '/tmp/ws', title: '', events: readLogEvents(source), exporter: 'e' }), false)
    rmSync(source, { recursive: true, force: true })
    const doc = readExportFile(path)
    const target = join(dir, 'restored2', 'session-gone')
    writeRestoredLog({ dir: target, id: 'session-gone', cwd: '/tmp/ws', createdAt: 1, events: doc.events })
    expect(readSessionTitle(target).firstUser).toBe('这条对话要留档')
  })
})

describe('save arguments', () => {
  it('parses the kiro-cli shape', () => {
    expect(parseSaveArgs(['/tmp/a.json'])).toEqual({ path: '/tmp/a.json', force: false, help: false })
    expect(parseSaveArgs(['-f', '/tmp/a.json'])).toMatchObject({ path: '/tmp/a.json', force: true })
    expect(parseSaveArgs(['/tmp/a.json', '--force'])).toMatchObject({ path: '/tmp/a.json', force: true })
    expect(parseSaveArgs(['--help'])).toMatchObject({ help: true, path: undefined })
    expect(parseSaveArgs([])).toMatchObject({ path: undefined, force: false })
  })
})
