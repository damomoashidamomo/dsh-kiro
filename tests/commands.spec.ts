import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/markdown/render'
import {
  applyOutcome,
  detectPrefix,
  emptyBuffer,
  isSlashReady,
  isAtReady,
  isShellReady,
} from '../src/runtime/input'

describe('renderMarkdown', () => {
  it('renders headings with underline', () => {
    const out = renderMarkdown('# Title\n\nbody')
    expect(out).toContain('# Title')
    expect(out).toContain('─')
  })

  it('renders bold and italic via ANSI', () => {
    const out = renderMarkdown('**bold** *italic*')
    expect(out).toContain('bold')
    expect(out).toContain('italic')
  })

  it('renders fenced code blocks BORDERLESS (0.9.6: clean rectangle-select copy)', () => {
    const out = renderMarkdown('```ts\nconst x = 1\n```')
    expect(out).toContain('▌ ts')            // 语言角标做分隔
    expect(out).toContain('const x = 1')
    expect(out).not.toContain('╭')           // 盒子会污染终端选择
    expect(out).not.toContain('│')
  })

  it('renders unordered lists', () => {
    const out = renderMarkdown('- a\n- b\n- c')
    expect(out).toContain('•')
  })

  it('renders GFM tables with kiro-style pipe separators', () => {
    const out = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(out).toContain('│')
    expect(out).toContain('1')
    expect(out).toContain('│')
  })

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })
})

describe('input helpers', () => {
  it('detects /, @, ! prefixes', () => {
    expect(detectPrefix('/help')).toBe('/')
    expect(detectPrefix('@tool')).toBe('@')
    expect(detectPrefix('!ls')).toBe('!')
    expect(detectPrefix('hello')).toBeUndefined()
  })

  it('slash readiness', () => {
    expect(isSlashReady('/h')).toBe(true)
    expect(isSlashReady('/help')).toBe(true)
    expect(isSlashReady('/')).toBe(false)
    expect(isSlashReady('hello')).toBe(false)
  })

  it('at readiness', () => {
    expect(isAtReady('@foo')).toBe(true)
    expect(isAtReady('@server/tool')).toBe(true)
    expect(isAtReady('@')).toBe(false)
  })

  it('shell readiness', () => {
    expect(isShellReady('!')).toBe(false)
    expect(isShellReady('!ls')).toBe(true)
    expect(isShellReady('hello')).toBe(false)
  })

  it('applyOutcome ignores unknown kinds', () => {
    const buffer = emptyBuffer()
    const next = applyOutcome(buffer, { kind: 'ignore' })
    expect(next.text).toBe('')
  })

  it('applyOutcome inserts text at cursor', () => {
    let buffer = emptyBuffer()
    buffer = applyOutcome(buffer, { kind: 'insert', text: 'hello' })
    expect(buffer.text).toBe('hello')
    expect(buffer.cursor).toBe(5)
  })

  it('applyOutcome handles backspace', () => {
    let buffer = emptyBuffer()
    buffer = applyOutcome(buffer, { kind: 'insert', text: 'hi' })
    buffer = applyOutcome(buffer, { kind: 'backspace' })
    expect(buffer.text).toBe('h')
    expect(buffer.cursor).toBe(1)
  })

  it('applyOutcome moves cursor with word jumps', () => {
    let buffer = emptyBuffer()
    buffer = applyOutcome(buffer, { kind: 'insert', text: 'hello world' })
    buffer = applyOutcome(buffer, { kind: 'cursor-left', word: true })
    // Cursor lands at the start of "world".
    expect(buffer.cursor).toBe(6)
  })
})

describe('parseModel', () => {
  it('splits provider and model on the first slash', async () => {
    const { parseModel } = await import('../src/commands/model')
    expect(parseModel('deepseek-official/deepseek-v4-flash')).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
  })

  it('preserves slashes in the model name', async () => {
    const { parseModel } = await import('../src/commands/model')
    expect(parseModel('provider/a/b/c')).toEqual({
      provider: 'provider',
      model: 'a/b/c',
    })
  })

  it('returns undefined for empty, missing slash, or empty halves', async () => {
    const { parseModel } = await import('../src/commands/model')
    expect(parseModel('')).toBeUndefined()
    expect(parseModel('no-slash')).toBeUndefined()
    expect(parseModel('/leading-slash')).toBeUndefined()
    expect(parseModel('trailing-slash/')).toBeUndefined()
  })

  it('trims surrounding whitespace from both halves', async () => {
    const { parseModel } = await import('../src/commands/model')
    expect(parseModel('  provider / model  ')).toEqual({
      provider: 'provider',
      model: 'model',
    })
  })
})

describe('code-registry (0.9.6 B+C)', () => {
  it('records blocks, numbers them, spills long ones to disk', async () => {
    const { recordCodeBlock, recentCodeBlocks, codeBlockByN, resetCodeBlocks } = await import('../src/runtime/code-registry')
    resetCodeBlocks()
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-code-reg-'))
    const a = recordCodeBlock('bash', 'kubectl get nodes', tmp)
    expect(a.n).toBe(1)
    expect(a.file).toBeUndefined()          // 1 行不落盘
    const long = ['#!/bin/bash', 'set -e', 'echo one', 'echo two', 'echo three', 'echo four'].join('\n')
    const b = recordCodeBlock('bash', long, tmp)
    expect(b.n).toBe(2)
    expect(b.file).toBeDefined()            // ≥5 行落盘
    const { readFileSync } = fs
    expect(readFileSync(b.file!, 'utf8')).toContain('#!/bin/bash')
    expect(recentCodeBlocks(10)[0]!.n).toBe(2)  // 新→旧
    expect(codeBlockByN(1)!.text).toBe('kubectl get nodes')
    resetCodeBlocks()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('osc52Sequence wraps base64 payload in the standard escape', async () => {
    const { osc52Sequence } = await import('../src/runtime/code-registry')
    const seq = osc52Sequence('ls')
    expect(seq.startsWith('\x1b]52;c;')).toBe(true)
    expect(seq.endsWith('\x07')).toBe(true)
    expect(seq).toContain(Buffer.from('ls', 'utf8').toString('base64'))
  })
})

describe('compact consecutive code runs (0.9.7)', () => {
  it('merges same-language fences into one labeled unit with zero blank lines between commands', () => {
    const md = ['```bash', 'kubectl get cs', '```', '', '```bash', 'kubectl top nodes', '```'].join('\n')
    const out = renderMarkdown(md)
    expect(out).toContain('▌ bash ×2')
    expect(out).toContain('kubectl get cs')
    expect(out).toContain('kubectl top nodes')
    // 合并单元内命令之间无空行
    const between = out.split('kubectl get cs')[1]?.split('kubectl top nodes')[0] ?? ''
    expect(between.trim()).toBe('')
  })

  it('single code block keeps the plain label (no ×1)', () => {
    const out = renderMarkdown('```bash\nls\n```')
    expect(out).toContain('▌ bash')
    expect(out).not.toContain('×1')
  })

  it('mixed languages still merge with a plain ×N label', () => {
    const md = ['```bash\nls\n```', '', '```python\nprint(1)\n```'].join('\n')
    const out = renderMarkdown(md)
    expect(out).toContain('×2')
  })
})
