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

  it('renders fenced code blocks with frame', () => {
    const out = renderMarkdown('```ts\nconst x = 1\n```')
    expect(out).toContain('╭')
    expect(out).toContain('╰')
    expect(out).toContain('const x = 1')
  })

  it('renders unordered lists', () => {
    const out = renderMarkdown('- a\n- b\n- c')
    expect(out).toContain('•')
  })

  it('renders GFM tables with box-drawing chars', () => {
    const out = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(out).toContain('┌')
    expect(out).toContain('└')
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
