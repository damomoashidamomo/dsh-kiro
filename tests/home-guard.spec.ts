import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffSnapshots, guardRoot, snapshotTree } from './home-guard'

/**
 * The guard that keeps unit tests out of the real `~/.kiro`. Its detection
 * logic is exercised against a /tmp tree here — proving it works without ever
 * touching the real directory (a test that wrote there would be the very bug
 * the guard exists to catch).
 */

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-home-guard-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('home guard', () => {
  it('reports no change for an untouched tree', () => {
    mkdirSync(join(root, 'settings'), { recursive: true })
    writeFileSync(join(root, 'settings', 'cli.json'), '{}')
    const before = snapshotTree(root)
    expect(diffSnapshots(before, snapshotTree(root))).toEqual([])
  })

  it('catches a created file (the deleted-then-rewritten trust file case)', () => {
    mkdirSync(join(root, 'settings'), { recursive: true })
    const before = snapshotTree(root)
    writeFileSync(join(root, 'settings', 'trusted-tools.json'), '{"trustAll":true}')
    const changes = diffSnapshots(before, snapshotTree(root))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toContain('created')
    expect(changes[0]).toContain('trusted-tools.json')
  })

  it('catches a modified file', () => {
    const file = join(root, 'agents.json')
    writeFileSync(file, 'one')
    const before = snapshotTree(root)
    appendFileSync(file, 'two')
    expect(diffSnapshots(before, snapshotTree(root))[0]).toContain('modified')
  })

  it('catches a deleted file', () => {
    const file = join(root, 'skill.md')
    writeFileSync(file, 'x')
    const before = snapshotTree(root)
    unlinkSync(file)
    expect(diffSnapshots(before, snapshotTree(root))[0]).toContain('deleted')
  })

  it('fingerprints nested files, not directories', () => {
    mkdirSync(join(root, 'agents', 'nested'), { recursive: true })
    writeFileSync(join(root, 'agents', 'nested', 'a.json'), 'a')
    expect([...snapshotTree(root).keys()]).toEqual([join(root, 'agents', 'nested', 'a.json')])
  })

  it('an override root wins over the real kiro directory', () => {
    const previous = process.env.DSH_KIRO_HOME_GUARD_ROOT
    process.env.DSH_KIRO_HOME_GUARD_ROOT = root
    try {
      expect(guardRoot()).toBe(root)
    } finally {
      if (previous === undefined) delete process.env.DSH_KIRO_HOME_GUARD_ROOT
      else process.env.DSH_KIRO_HOME_GUARD_ROOT = previous
    }
  })
})
