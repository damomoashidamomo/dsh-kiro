/**
 * Rendering-flicker regression (PTY-independent).
 *
 * The TUI flickered because every frame erased and rewrote the WHOLE live
 * region (`eraseLines(n) + output`), and — worse — once the live region
 * reached the terminal height, ink took its `clearTerminal` branch:
 * `\x1b[2J` (clear screen) + `\x1b[3J` (clear SCROLLBACK) + a reprint of the
 * entire static transcript, every single frame.
 *
 * These tests drive the real patched ink with a fake TTY and assert the two
 * invariants that make the difference visible (or not) on screen:
 *   1. a streaming answer never clears the screen or the scrollback, and
 *   2. a frame that grows by one line repaints only the changed tail, so the
 *      byte cost per frame stays bounded instead of scaling with the answer.
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink'
import { Transcript } from '../src/ui/Transcript'
import type { Message } from '../src/runtime/types'

interface FakeStdout {
  columns: number
  rows: number
  isTTY: boolean
  write: (chunk: string) => boolean
  text: () => string
  bytes: () => number
  reset: () => void
  on: () => void
  off: () => void
  once: () => void
  removeListener: () => void
  removeAllListeners: () => void
  getColorDepth: () => number
  hasColors: () => boolean
}

function fakeStdout(columns = 100, rows = 20): FakeStdout {
  const chunks: string[] = []
  return {
    columns,
    rows,
    isTTY: true,
    write(chunk: string): boolean { chunks.push(String(chunk)); return true },
    text: () => chunks.join(''),
    bytes: () => Buffer.byteLength(chunks.join('')),
    reset: () => { chunks.length = 0 },
    on: () => {},
    off: () => {},
    once: () => {},
    removeListener: () => {},
    removeAllListeners: () => {},
    getColorDepth: () => 24,
    hasColors: () => true,
  }
}

function fakeStdin() {
  return {
    isTTY: false,
    setRawMode() {}, on() {}, off() {}, resume() {}, pause() {},
    setEncoding() {}, removeListener() {}, read() { return null },
  }
}

function streamingAssistant(text: string): Message {
  return {
    id: 'a1',
    kind: 'assistant',
    text,
    tool: undefined,
    createdAt: Date.now(),
    seq: 1,
    usage: undefined,
    streaming: true,
  }
}

async function settle(ms = 80): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** Wait until the fake stdout has produced its next write (ink throttles). */
async function waitForWrite(stdout: FakeStdout, before: number, timeoutMs = 800): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (stdout.bytes() > before) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('renderer flicker invariants', () => {
  it('streaming a screen-taller answer never clears screen or scrollback', async () => {
    const stdout = fakeStdout(100, 20)
    let text = ''
    const app = render(<Transcript messages={[streamingAssistant(text)]} />, {
      stdout: stdout as never,
      stdin: fakeStdin() as never,
      showCursor: true,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    await settle()

    // 30 lines stream in one at a time — the live region outgrows the 20-row
    // terminal, which is exactly where ink used to clearTerminal every frame.
    for (let i = 0; i < 30; i += 1) {
      text += `line ${i}: streaming answer content\n`
      app.rerender(<Transcript messages={[streamingAssistant(text)]} />)
      await settle(60)
    }
    app.unmount()

    const all = stdout.text()
    expect(count(all, '\x1b[2J'), 'clear-screen sequences').toBe(0)
    expect(count(all, '\x1b[3J'), 'clear-scrollback sequences').toBe(0)
  })

  it('a one-line growth repaints only the tail, not the whole live region', async () => {
    const stdout = fakeStdout(100, 20)
    let text = ''
    const app = render(<Transcript messages={[streamingAssistant(text)]} />, {
      stdout: stdout as never,
      stdin: fakeStdin() as never,
      showCursor: true,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    await settle()

    // Warm up to a ~16 line live region, then measure per-line growth.
    for (let i = 0; i < 16; i += 1) {
      text += `warm ${i}: a fairly long line of streaming answer text here\n`
      app.rerender(<Transcript messages={[streamingAssistant(text)]} />)
      await settle(60)
    }
    const perFrame: number[] = []
    for (let i = 0; i < 6; i += 1) {
      text += `grow ${i}: a fairly long line of streaming answer text here\n`
      const before = stdout.bytes()
      app.rerender(<Transcript messages={[streamingAssistant(text)]} />)
      await waitForWrite(stdout, before)
      perFrame.push(stdout.bytes() - before)
    }
    app.unmount()

    // One appended line is ~60 bytes of text. A full-region repaint costs
    // ~1200 bytes here (measured before the fix); a tail-only repaint costs
    // a couple hundred.
    for (const bytes of perFrame) {
      expect(bytes, `frame bytes ${perFrame.join(',')}`).toBeLessThan(600)
    }
    const finalFrame = stdout.text()
    expect(finalFrame).toContain('grow 5')
  })

  it('erases only the lines it rewrites', async () => {
    const stdout = fakeStdout(100, 20)
    let text = ''
    const app = render(<Transcript messages={[streamingAssistant(text)]} />, {
      stdout: stdout as never,
      stdin: fakeStdin() as never,
      showCursor: true,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    await settle()
    for (let i = 0; i < 16; i += 1) {
      text += `row ${i}\n`
      app.rerender(<Transcript messages={[streamingAssistant(text)]} />)
      await settle(60)
    }
    stdout.reset()
    text += 'row 16\n'
    const before = stdout.bytes()
    app.rerender(<Transcript messages={[streamingAssistant(text)]} />)
    await waitForWrite(stdout, before)
    const chunk = stdout.text()
    app.unmount()

    // Appending one line: erase the previous tail line + write the new one.
    // A full-region erase would emit ~16 erase-line sequences here.
    expect(count(chunk, '\x1b[2K')).toBeLessThanOrEqual(4)
  })

  it('a shrinking frame blanks the removed lines without clearing the screen', async () => {
    const stdout = fakeStdout(100, 20)
    let rows = 8
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n')
    const app = render(<Transcript messages={[streamingAssistant(lines(rows))]} />, {
      stdout: stdout as never,
      stdin: fakeStdin() as never,
      showCursor: true,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    await settle()
    stdout.reset()
    rows = 3
    const before = stdout.bytes()
    app.rerender(<Transcript messages={[streamingAssistant(lines(rows))]} />)
    await waitForWrite(stdout, before)
    await settle(40)
    const chunk = stdout.text()
    app.unmount()

    expect(count(chunk, '\x1b[2J')).toBe(0)
    // The 5 removed lines are erased individually, never by clearing the screen.
    expect(count(chunk, '\x1b[2K')).toBeGreaterThanOrEqual(1)
  })

  it('a change ABOVE a screen-taller frame repaints at most one viewport', async () => {
    const stdout = fakeStdout(100, 20)
    const rowsText = (n: number, tag: string) =>
      Array.from({ length: n }, (_, i) => `line ${i} ${i === 1 ? tag : 'body'}`).join('\n')
    // 40 lines on a 20-row terminal: the top half has scrolled into the
    // scrollback and must never be repainted or cleared.
    const app = render(<Transcript messages={[streamingAssistant(rowsText(40, 'v1'))]} />, {
      stdout: stdout as never,
      stdin: fakeStdin() as never,
      showCursor: true,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    await settle(120)
    stdout.reset()
    const before = stdout.bytes()
    app.rerender(<Transcript messages={[streamingAssistant(rowsText(40, 'v2'))]} />)
    await waitForWrite(stdout, before)
    await settle(40)
    const chunk = stdout.text()
    app.unmount()

    expect(count(chunk, '\x1b[2J')).toBe(0)
    expect(count(chunk, '\x1b[3J')).toBe(0)
    // At most one viewport of rows is repainted, not all 40.
    expect(count(chunk, '\x1b[2K')).toBeLessThanOrEqual(21)
  })
})
