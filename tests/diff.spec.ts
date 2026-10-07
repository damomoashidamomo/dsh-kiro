import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildEditDiff, isEditableTool } from '../src/ui/diff'

const dir = mkdtempSync(join(tmpdir(), 'kiro-diff-'))

beforeAll(() => {
  mkdirSync(join(dir, '.kiro'), { recursive: true })
  writeFileSync(join(dir, 'exists.txt'), 'alpha\nbeta\ngamma\ndelta\nfar1\nfar2\nfar3\nfar4\nfar5\nepsilon\n')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('buildEditDiff', () => {
  it('flags the editable tools', () => {
    expect(isEditableTool('str_replace_editor')).toBe(true)
    expect(isEditableTool('write')).toBe(true)
    expect(isEditableTool('edit')).toBe(true)
    expect(isEditableTool('bash')).toBe(false)
  })

  it('fs edit: old_string/new_string render as del+add', () => {
    const rows = buildEditDiff('edit', JSON.stringify({
      file_path: join(dir, 'exists.txt'),
      old_string: 'beta\ngamma',
      new_string: 'BETA',
    }))
    expect(rows?.find((r) => r.kind === 'del')?.text).toBe('beta')
    expect(rows?.find((r) => r.kind === 'add')?.text).toBe('BETA')
    expect(rows?.some((r) => r.text === 'epsilon')).toBe(false)
  })

  it('create: new file renders as all-additions with new-file header', () => {
    const rows = buildEditDiff('write', JSON.stringify({
      file_path: join(dir, 'fresh.txt'), content: 'line1\nline2',
    }))
    expect(rows?.[0]?.text).toBe('--- (新文件)')
    expect(rows?.filter((r) => r.kind === 'add').map((r) => r.text)).toEqual(['line1', 'line2'])
    expect(rows?.some((r) => r.kind === 'del')).toBe(false)
  })

  it('str_replace: replaced lines come out as del+add with a hunk header', () => {
    const rows = buildEditDiff('str_replace_editor', JSON.stringify({
      command: 'str_replace',
      path: join(dir, 'exists.txt'),
      old_str: 'beta\ngamma',
      new_str: 'BETA',
    }))
    expect(rows).toBeDefined()
    const kinds = rows!.map((r) => r.kind)
    expect(kinds).toContain('del')
    expect(kinds).toContain('add')
    expect(rows!.find((r) => r.kind === 'del')?.text).toBe('beta')
    expect(rows!.find((r) => r.kind === 'add')?.text).toBe('BETA')
    expect(kinds).toContain('hunk')
    // untouched distant lines are not shown (context collapse)
    expect(rows!.some((r) => r.text === 'epsilon')).toBe(false)
  })

  it('str_replace with a stale old_str reports instead of crashing', () => {
    const rows = buildEditDiff('str_replace_editor', JSON.stringify({
      command: 'str_replace',
      path: join(dir, 'exists.txt'),
      old_str: 'no-such-line',
      new_str: 'x',
    }))
    expect(rows?.[0]?.kind).toBe('note')
    expect(rows?.[0]?.text).toContain('未找到')
  })

  it('non-editable tools and junk JSON yield nothing', () => {
    expect(buildEditDiff('bash', '{"command":"ls"}')).toBeUndefined()
    expect(buildEditDiff('write', 'not json')).toBeUndefined()
    expect(buildEditDiff('write', undefined)).toBeUndefined()
  })

  it('caps the rendered rows for huge payloads', () => {
    const big = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n')
    const rows = buildEditDiff('write', JSON.stringify({
      file_path: join(dir, 'big.txt'), content: big,
    }))
    const note = rows?.find((r) => r.kind === 'note')
    expect(note?.text).toContain('还有')
    expect(rows!.length).toBeLessThanOrEqual(63)
  })
})
