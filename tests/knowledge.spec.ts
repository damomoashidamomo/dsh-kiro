import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeStore } from '../src/knowledge/store'

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'dsh-kiro-kb-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('KnowledgeStore', () => {
  it('starts empty', () => {
    const store = new KnowledgeStore(workDir)
    expect(store.list()).toEqual([])
  })

  it('adds and lists a file', () => {
    const file = join(workDir, 'doc.md')
    writeFileSync(file, '# Hello\n\nThis is a test document about TypeScript.')
    const store = new KnowledgeStore(workDir)
    const entry = store.addFile(file, 'Doc Label')
    expect(entry.label).toBe('Doc Label')
    expect(entry.size).toBeGreaterThan(0)
    expect(store.list()).toHaveLength(1)
  })

  it('removes an entry by id', () => {
    const file = join(workDir, 'doc.md')
    writeFileSync(file, 'content')
    const store = new KnowledgeStore(workDir)
    const entry = store.addFile(file)
    expect(store.remove(entry.id)).toBe(true)
    expect(store.list()).toEqual([])
    expect(store.remove(entry.id)).toBe(false)
  })

  it('clears all entries', () => {
    const a = join(workDir, 'a.md'); writeFileSync(a, 'a')
    const b = join(workDir, 'b.md'); writeFileSync(b, 'b')
    const store = new KnowledgeStore(workDir)
    store.addFile(a)
    store.addFile(b)
    store.clear()
    expect(store.list()).toEqual([])
  })

  it('ranks relevant documents above irrelevant ones', () => {
    const a = join(workDir, 'typescript.md')
    const b = join(workDir, 'recipes.md')
    writeFileSync(a, 'TypeScript is a programming language that builds on JavaScript with optional static typing.')
    writeFileSync(b, 'How to cook rice: rinse the rice, add water, simmer for 20 minutes.')
    const store = new KnowledgeStore(workDir)
    store.addFile(a)
    store.addFile(b)
    const results = store.query('TypeScript types')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.entry.path).toBe(a)
  })

  it('persists across instances', () => {
    const a = join(workDir, 'x.md')
    writeFileSync(a, 'persistent content')
    const first = new KnowledgeStore(workDir)
    const entry = first.addFile(a)
    const second = new KnowledgeStore(workDir)
    expect(second.list().map((e) => e.id)).toContain(entry.id)
  })

  it('returns no results for a non-matching query', () => {
    const a = join(workDir, 'a.md'); writeFileSync(a, 'foo bar baz')
    const store = new KnowledgeStore(workDir)
    store.addFile(a)
    expect(store.query('quantum entanglement')).toEqual([])
  })
})
