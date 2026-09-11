import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CheckpointManager } from '../src/checkpoint/manager'

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'dsh-kiro-ckpt-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('CheckpointManager', () => {
  it('starts uninitialized', () => {
    const mgr = new CheckpointManager(workDir)
    expect(mgr.isInitialized()).toBe(false)
    expect(mgr.list()).toEqual([])
  })

  it('initializes and snapshots', () => {
    const mgr = new CheckpointManager(workDir)
    mgr.init()
    expect(mgr.isInitialized()).toBe(true)
    writeFileSync(join(workDir, 'hello.txt'), 'first')
    const cp1 = mgr.snapshot('first version')
    expect(cp1.id).toBe(1)
    expect(cp1.label).toBe('first version')
    expect(cp1.hash).toMatch(/^[0-9a-f]{40}$/u)
    writeFileSync(join(workDir, 'hello.txt'), 'second')
    const cp2 = mgr.snapshot()
    expect(cp2.id).toBeGreaterThan(cp1.id)
    expect(mgr.list().length).toBeGreaterThanOrEqual(2)
  })

  it('restores a checkpoint by id', () => {
    const mgr = new CheckpointManager(workDir)
    mgr.init()
    writeFileSync(join(workDir, 'foo.txt'), 'one')
    const cp1 = mgr.snapshot('one')
    writeFileSync(join(workDir, 'foo.txt'), 'two')
    mgr.snapshot('two')
    mgr.restore(cp1.id)
    const restored = require('node:fs').readFileSync(join(workDir, 'foo.txt'), 'utf8')
    expect(restored).toBe('one')
  })

  it('produces a diff between two checkpoints', () => {
    const mgr = new CheckpointManager(workDir)
    mgr.init()
    writeFileSync(join(workDir, 'a.txt'), 'one')
    const cp1 = mgr.snapshot('first')
    writeFileSync(join(workDir, 'a.txt'), 'two')
    const cp2 = mgr.snapshot('second')
    const diff = mgr.diff(cp1.id, cp2.id)
    expect(diff).toContain('-one')
    expect(diff).toContain('+two')
  })

  it('cleans the shadow repo', () => {
    const mgr = new CheckpointManager(workDir)
    mgr.init()
    expect(existsSync(mgr.shadowDir)).toBe(true)
    mgr.clean()
    expect(existsSync(mgr.shadowDir)).toBe(false)
  })
})
