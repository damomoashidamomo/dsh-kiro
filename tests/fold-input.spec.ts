/**
 * foldInputChunk (T-8) — PTY-batched multi-byte input folding, extracted
 * from the Prompt component so the submit/paste/backspace semantics are
 * unit-testable.
 */

import { describe, it, expect } from 'vitest'
import { foldInputChunk } from '../src/runtime/input'

describe('foldInputChunk', () => {
  it('single plain characters insert as-is', () => {
    expect(foldInputChunk('a', '')).toEqual([{ kind: 'insert', text: 'a' }])
    expect(foldInputChunk('你', 'x')).toEqual([{ kind: 'insert', text: '你' }])
  })

  it('multi-char text without control bytes inserts whole (IME commit)', () => {
    expect(foldInputChunk('你好', '')).toEqual([{ kind: 'insert', text: '你好' }])
  })

  it('trailing Enter after keystrokes is a submit', () => {
    expect(foldInputChunk('/model\r', '')).toEqual([
      { kind: 'insert', text: '/' },
      { kind: 'insert', text: 'm' },
      { kind: 'insert', text: 'o' },
      { kind: 'insert', text: 'd' },
      { kind: 'insert', text: 'e' },
      { kind: 'insert', text: 'l' },
      { kind: 'submit' },
    ])
  })

  it('backspace bytes in a batch cancel characters', () => {
    expect(foldInputChunk('\b\bh', 'ab')).toEqual([
      { kind: 'backspace' },
      { kind: 'backspace' },
      { kind: 'insert', text: 'h' },
    ])
  })

  it('an embedded newline is a paste newline, not a submit', () => {
    expect(foldInputChunk('line1\nline2\r', '')).toEqual([
      { kind: 'insert', text: 'l' },
      { kind: 'insert', text: 'i' },
      { kind: 'insert', text: 'n' },
      { kind: 'insert', text: 'e' },
      { kind: 'insert', text: '1' },
      { kind: 'newline' },
      { kind: 'insert', text: 'l' },
      { kind: 'insert', text: 'i' },
      { kind: 'insert', text: 'n' },
      { kind: 'insert', text: 'e' },
      { kind: 'insert', text: '2' },
      { kind: 'submit' },
    ])
  })
})
