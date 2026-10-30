import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, readdirSync, utimesSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pasteCommand } from '../src/commands/paste'

let root: string
const run = (rawInput: string) => pasteCommand.handler({
  agent: { session: { header: { cwd: root } } } as never,
  rawInput,
} as never)

const pasteDir = (): string => join(root, '.kiro', 'paste')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kiro-paste-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('/paste', () => {
  it('reports an empty directory when nothing was spilled', async () => {
    const result = await run('')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('没有落盘的粘贴文件')
  })

  it('lists spilled files newest first with size', async () => {
    mkdirSync(pasteDir(), { recursive: true })
    writeFileSync(join(pasteDir(), 'paste-20240101000000.txt'), 'old')
    writeFileSync(join(pasteDir(), 'paste-20240102000000.txt'), 'new content')
    // Pin mtimes so ordering is deterministic.
    utimesSync(join(pasteDir(), 'paste-20240101000000.txt'), new Date('2024-01-01'), new Date('2024-01-01'))
    utimesSync(join(pasteDir(), 'paste-20240102000000.txt'), new Date('2024-01-02'), new Date('2024-01-02'))

    const result = await run('list')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('落盘粘贴文件（2')
    const older = result.text.indexOf('paste-20240101000000.txt')
    const newer = result.text.indexOf('paste-20240102000000.txt')
    // Newest first: the 01-02 file comes before the 01-01 file.
    expect(newer).toBeLessThan(older)
    expect(result.text).toContain('11 B') // 'new content'.length
  })

  it('clean removes only paste-*.txt files and keeps foreign files', async () => {
    mkdirSync(pasteDir(), { recursive: true })
    writeFileSync(join(pasteDir(), 'paste-20240101000000.txt'), 'a')
    writeFileSync(join(pasteDir(), 'paste-20240102000000.txt'), 'b')
    writeFileSync(join(pasteDir(), 'keep.txt'), 'not a spill file')

    const result = await run('clean')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('已删除 2/2')
    expect(readdirSync(pasteDir())).toEqual(['keep.txt'])
  })

  it('clean removes the directory when it only held spill files', async () => {
    mkdirSync(pasteDir(), { recursive: true })
    writeFileSync(join(pasteDir(), 'paste-20240101000000.txt'), 'a')
    await run('clean')
    expect(existsSync(pasteDir())).toBe(false)
  })

  it('rejects an unknown subcommand with usage', async () => {
    const result = await run('frobnicate')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('usage: /paste')
  })
})
