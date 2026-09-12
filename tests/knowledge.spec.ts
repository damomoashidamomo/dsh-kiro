import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeStore, tokenize } from '../src/knowledge/store'
import { renderKnowledgeContext } from '../src/knowledge'
import { knowledgeCommand } from '../src/commands/knowledge'

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
    expect(store.size()).toBe(0)
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

  it('re-adding the same path updates in place instead of duplicating', () => {
    const file = join(workDir, 'doc.md')
    writeFileSync(file, 'first version')
    const store = new KnowledgeStore(workDir)
    const first = store.addFile(file, 'Doc')
    writeFileSync(file, 'second version is much longer than the first one')
    const second = store.addFile(file)
    expect(store.size()).toBe(1)
    expect(second.id).toBe(first.id)
    expect(second.preview).toContain('second version')
    expect(second.size).toBeGreaterThan(first.size)
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

  it('removes by 1-based index and by label', () => {
    const a = join(workDir, 'a.md'); writeFileSync(a, 'aaa')
    const b = join(workDir, 'b.md'); writeFileSync(b, 'bbb')
    const store = new KnowledgeStore(workDir)
    store.addFile(a, 'Alpha')
    store.addFile(b, 'Beta')
    expect(store.remove('2')).toBe(true) // index
    expect(store.list().map((e) => e.label)).toEqual(['Alpha'])
    expect(store.remove('Alpha')).toBe(true) // label
    expect(store.list()).toEqual([])
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

  it('applies real IDF: a rare term outranks a term present in every doc', () => {
    const common = join(workDir, 'common.md')
    const rare = join(workDir, 'rare.md')
    // Both docs contain "shared"; only `rare` contains "aardvark".
    writeFileSync(common, 'shared shared shared shared shared shared shared shared shared shared')
    writeFileSync(rare, 'shared shared shared shared shared shared shared shared shared aardvark')
    const store = new KnowledgeStore(workDir)
    store.addFile(common)
    store.addFile(rare)
    const results = store.query('shared aardvark')
    expect(results[0]?.entry.path).toBe(rare)
    // And the aardvark doc scores strictly higher than the common-only doc.
    const scores = new Map(results.map((r) => [r.entry.path, r.score]))
    expect(scores.get(rare) ?? 0).toBeGreaterThan(scores.get(common) ?? 0)
  })

  it('normalizes by document length', () => {
    const short = join(workDir, 'short.md')
    const long = join(workDir, 'long.md')
    writeFileSync(short, 'needle at the start here.')
    writeFileSync(long, ('needle ' + 'filler '.repeat(200)).trim())
    const store = new KnowledgeStore(workDir)
    store.addFile(short)
    store.addFile(long)
    const results = store.query('needle')
    expect(results[0]?.entry.path).toBe(short)
  })

  it('tokenizes CJK text into unigrams', () => {
    expect(tokenize('TypeScript 类型系统')).toEqual(['typescript', '类', '型', '系', '统'])
  })

  it('searches Chinese notes', () => {
    const a = join(workDir, 'zh.md')
    const b = join(workDir, 'en.md')
    writeFileSync(a, '这是一个关于知识库检索的文档，讨论 BM25 算法。')
    writeFileSync(b, 'This document is about cooking pasta with olive oil.')
    const store = new KnowledgeStore(workDir)
    store.addFile(a)
    store.addFile(b)
    const results = store.query('知识库 检索')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.entry.path).toBe(a)
  })

  it('returns snippets with an ellipsized window around the match', () => {
    const file = join(workDir, 'doc.md')
    writeFileSync(file, ('padding '.repeat(40)) + 'TARGETTERM here is the match' + (' padding' .repeat(40)))
    const store = new KnowledgeStore(workDir)
    store.addFile(file)
    const results = store.query('TARGETTERM')
    expect(results[0]?.snippet).toContain('TARGETTERM')
    expect(results[0]?.snippet.startsWith('…')).toBe(true)
    expect(results[0]?.snippet.endsWith('…')).toBe(true)
    expect(results[0]?.snippet.length).toBeLessThan(320)
  })

  it('indexes a directory recursively and skips noise', () => {
    const src = join(workDir, 'src')
    mkdirSync(join(src, 'sub'), { recursive: true })
    mkdirSync(join(src, 'node_modules'), { recursive: true })
    mkdirSync(join(src, '.git'), { recursive: true })
    writeFileSync(join(src, 'main.ts'), 'export const main = () => "hello"')
    writeFileSync(join(src, 'sub', 'helper.ts'), 'export const helper = 1')
    writeFileSync(join(src, 'node_modules', 'dep.ts'), 'ignored')
    writeFileSync(join(src, '.git', 'config'), 'ignored')
    writeFileSync(join(src, 'notes.md'), 'some notes')
    writeFileSync(join(src, 'image.png'), '\u0000binary')
    const store = new KnowledgeStore(workDir)
    const added = store.addDir(src)
    expect(added).toHaveLength(3)
    const labels = added.map((e) => e.label)
    expect(labels).toContain('src:main.ts')
    expect(labels).toContain('src:sub/helper.ts')
    expect(labels).toContain('src:notes.md')
    expect(labels.some((l) => l.includes('node_modules'))).toBe(false)
    expect(labels.some((l) => l.includes('.git'))).toBe(false)
    expect(labels.some((l) => l.includes('image'))).toBe(false)
  })

  it('updates an entry from its source file', () => {
    const file = join(workDir, 'doc.md')
    writeFileSync(file, 'old content about ferrets')
    const store = new KnowledgeStore(workDir)
    const entry = store.addFile(file, 'Doc')
    writeFileSync(file, 'new content about capybara and more text here')
    const updated = store.update(entry.id)
    expect(updated).toBeDefined()
    expect(updated?.preview).toContain('new content')
    expect(store.query('capybara').length).toBeGreaterThan(0)
    expect(store.query('ferret')).toEqual([])
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

describe('renderKnowledgeContext', () => {
  it('renders a compact block from hits', () => {
    const block = renderKnowledgeContext([
      {
        entry: { id: 'x', label: 'docs', path: '/x.md', indexedAt: 0, size: 10, preview: 'p' },
        score: 1.5,
        snippet: 'the snippet text',
      },
    ])
    expect(block).toContain('1 hit')
    expect(block).toContain('docs')
    expect(block).toContain('the snippet text')
  })

  it('returns empty for no hits', () => {
    expect(renderKnowledgeContext([])).toBe('')
  })
})

describe('/knowledge command', () => {
  function fakeAgent(store: KnowledgeStore): unknown {
    return {
      ctx: { get: (key: string) => (key === 'kiroKnowledge' ? store : undefined) },
    }
  }

  it('shows empty state', async () => {
    const store = new KnowledgeStore(workDir)
    const outcome = await knowledgeCommand.handler({
      agent: fakeAgent(store),
      rawInput: '',
    })
    expect(outcome?.kind).toBe('success')
    expect(String(outcome?.text)).toContain('empty')
  })

  it('adds, lists, searches, and clears through the command surface', async () => {
    const store = new KnowledgeStore(workDir)
    const file = join(workDir, 'typescript.md')
    writeFileSync(file, 'TypeScript has a static type system and a structural type checker.')
    const add = await knowledgeCommand.handler({ agent: fakeAgent(store), rawInput: `add ${file}` })
    expect(String(add?.text)).toContain('indexed')

    const list = await knowledgeCommand.handler({ agent: fakeAgent(store), rawInput: 'list' })
    expect(String(list?.text)).toContain('typescript.md')

    const search = await knowledgeCommand.handler({ agent: fakeAgent(store), rawInput: 'search static type' })
    expect(String(search?.text)).toContain('score')

    const clear = await knowledgeCommand.handler({ agent: fakeAgent(store), rawInput: 'clear' })
    expect(String(clear?.text)).toContain('cleared')
    expect(store.size()).toBe(0)
  })

  it('reports a missing service', async () => {
    const outcome = await knowledgeCommand.handler({
      agent: { ctx: { get: () => undefined } },
      rawInput: 'list',
    })
    expect(outcome?.kind).toBe('error')
  })
})
