import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/markdown/render'

/** OSC 8 opener (non-empty URL) and the closing sequence. */
const OSC8_OPEN = /\u001b\]8;;[^\u001b]+\u001b\\/g
const OSC8_CLOSE = '\u001b]8;;\u001b\\'

const opens = (text: string): number => text.match(OSC8_OPEN)?.length ?? 0
const closes = (text: string): number => text.split(OSC8_CLOSE).length - 1

describe('markdown links', () => {
  it('wraps a markdown link label and href in OSC 8 hyperlinks', () => {
    const out = renderMarkdown('[DeepSeek 官网](https://www.deepseek.com)')
    expect(out).toContain(`\u001b]8;;https://www.deepseek.com\u001b\\DeepSeek 官网\u001b]8;;\u001b\\`)
    expect(out).toContain(`\u001b]8;;https://www.deepseek.com\u001b\\(https://www.deepseek.com)`)
  })

  it('autolinks a bare URL exactly once (no double envelope)', () => {
    const out = renderMarkdown('see https://www.deepseek.com here')
    expect(opens(out)).toBe(1)
    expect(out).toContain('\u001b]8;;https://www.deepseek.com\u001b\\https://www.deepseek.com\u001b]8;;\u001b\\')
    expect(out).not.toContain('(https://www.deepseek.com)')
  })

  it('keeps the hyperlink envelope intact when a long line wraps', () => {
    const out = renderMarkdown('前言 ' + '[深](https://example.com/a/long/path) 后面还有很多很多文字用来强制换行 '.repeat(4))
    // Two envelopes per link (label + href): four links → eight openers.
    expect(opens(out)).toBe(8)
    expect(closes(out)).toBe(opens(out))
  })
})
