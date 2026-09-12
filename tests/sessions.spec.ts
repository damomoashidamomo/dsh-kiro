/**
 * Tests for the session-catalog utility: list, filter, format, delete.
 *
 * Builds a fake `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd` tree
 * by writing a real (zstd-compressed via node:zlib) header file, then runs
 * the listing logic and confirms the header fields are extracted correctly.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteSession,
  filterSessions,
  formatTimestamp,
  listSessions,
} from '../src/utils/sessions'

function writeSession(home: string, source: string, id: string, header: Record<string, unknown>): void {
  const dir = join(home, 'sessions', source, id)
  mkdirSync(dir, { recursive: true })
  const jsonl = JSON.stringify({ type: 'session', version: 3, isSeeded: false, delegationDepth: 0, ...header }) + '\n'
  const compressed = zstdCompressSync(Buffer.from(jsonl, 'utf8'))
  writeFileSync(join(dir, 'session.v3.jsonl.zstd'), compressed)
}

let home: string

beforeEach(() => {
  home = join(tmpdir(), `dsh-kiro-sessions-test-${Math.random().toString(36).slice(2)}`)
  mkdirSync(home, { recursive: true })
})

afterEach(() => {
  if (existsSync(home)) rmSync(home, { recursive: true, force: true })
})

describe('listSessions', () => {
  it('returns an empty list when the sessions root is missing', () => {
    expect(listSessions(home)).toEqual([])
  })

  it('extracts header fields from a single compressed session', () => {
    writeSession(home, 'src-a', 'session-aaaa', {
      id: 'session-aaaa',
      cwd: '/tmp/proj',
      createdAt: 1700000000000,
    })
    const list = listSessions(home)
    expect(list.length).toBe(1)
    expect(list[0]?.id).toBe('session-aaaa')
    expect(list[0]?.cwd).toBe('/tmp/proj')
    expect(list[0]?.createdAt).toBe(1700000000000)
    expect(list[0]?.source).toBe('src-a')
  })

  it('sorts sessions newest-first', () => {
    writeSession(home, 'src', 'session-older', { id: 'session-older', cwd: '/tmp/proj', createdAt: 1000 })
    writeSession(home, 'src', 'session-newer', { id: 'session-newer', cwd: '/tmp/proj', createdAt: 5000 })
    const list = listSessions(home)
    expect(list.map((s) => s.id)).toEqual(['session-newer', 'session-older'])
  })

  it('skips malformed files without throwing', () => {
    const dir = join(home, 'sessions', 'src', 'session-broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.v3.jsonl.zstd'), Buffer.from('not-a-zstd-stream', 'utf8'))
    writeSession(home, 'src', 'session-good', { id: 'session-good', cwd: '/tmp/proj', createdAt: 1 })
    expect(listSessions(home).map((s) => s.id)).toEqual(['session-good'])
  })
})

describe('filterSessions', () => {
  const summaries = [
    { id: 's1', cwd: '/home/u/proj', createdAt: 1, dir: '', source: '' },
    { id: 's2', cwd: '/home/u/other', createdAt: 2, dir: '', source: '' },
    { id: 's3', cwd: '/home/u/proj/sub', createdAt: 3, dir: '', source: '' },
    { id: 's4', cwd: '/home/u', createdAt: 4, dir: '', source: '' },
    { id: 's5', cwd: '/elsewhere', createdAt: 5, dir: '', source: '' },
  ]
  it('keeps sessions whose cwd equals the filter exactly', () => {
    const out = filterSessions(summaries, { cwd: '/home/u/proj' })
    expect(out.map((s) => s.id)).toEqual(['s1', 's3'])
  })
  it('keeps sessions whose cwd is a child of the filter', () => {
    const out = filterSessions(summaries, { cwd: '/home/u' })
    expect(out.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
  })
  it('drops cwds that are not descendants of the filter', () => {
    const out = filterSessions(summaries, { cwd: '/home/u/proj' })
    expect(out.find((s) => s.id === 's5')).toBeUndefined()
  })
  it('keeps nothing when the filter is unrelated to any session', () => {
    const out = filterSessions(summaries, { cwd: '/no/match' })
    expect(out).toEqual([])
  })
})

describe('deleteSession', () => {
  it('removes the session directory', () => {
    writeSession(home, 'src', 'session-rm', { id: 'session-rm', cwd: '/tmp/x', createdAt: 1 })
    expect(deleteSession('session-rm', home)).toBe(true)
    expect(existsSync(join(home, 'sessions', 'src', 'session-rm'))).toBe(false)
  })

  it('returns false when the target does not exist', () => {
    expect(deleteSession('session-missing', home)).toBe(false)
  })
})

describe('formatTimestamp', () => {
  it('formats an epoch as YYYY-MM-DD HH:MM in local time', () => {
    const out = formatTimestamp(new Date(2025, 0, 2, 3, 4).getTime())
    expect(out).toMatch(/^2025-01-02 03:04$/)
  })
})