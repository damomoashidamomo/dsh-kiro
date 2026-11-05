import { describe, it, expect } from 'vitest'
import { Writable } from 'node:stream'
import { render } from 'ink'
import { Transcript } from '../src/ui/Transcript'
import { displayWidth } from '../src/markdown/render'
import type { Message } from '../src/runtime/types'

/**
 * What the TERMINAL shows, not what the app thinks it wrote.
 *
 * Ink's live region is repainted with relative cursor moves, so an off-by-one
 * row does not throw — it silently overwrites a neighbouring line and the
 * screen fills with duplicated fragments (a real report: "方案## 方案 B 简介 B
 * 简介"). Wrapped lines are the trigger: a logical line can occupy several
 * terminal rows, so "one line = one row" cursor math breaks as soon as CJK
 * text, a wide table row or the streaming caret glyph pushes a line past the
 * terminal width.
 *
 * This spec feeds the byte stream into a small screen model (lazy wrap, like a
 * real terminal) and asserts the rendered screen equals the expected text.
 */
class Screen {
  readonly cells: string[][]
  col = 0
  row = 0
  pendingWrap = false

  constructor(readonly cols: number, readonly height: number) {
    this.cells = [this.blank()]
  }

  private blank(): string[] {
    return Array.from({ length: this.cols }, () => ' ')
  }

  private ensure(row: number): void {
    while (this.cells.length <= row) this.cells.push(this.blank())
  }

  private put(ch: string, width: number): void {
    if (this.pendingWrap || this.col + width > this.cols) {
      this.row += 1
      this.col = 0
      this.pendingWrap = false
      this.ensure(this.row)
    }
    const line = this.cells[this.row]!
    line[this.col] = ch
    for (let i = 1; i < width; i += 1) line[this.col + i] = ''
    this.col += width
    if (this.col >= this.cols) {
      this.col = this.cols
      this.pendingWrap = true
    }
  }

  feed(data: string): void {
    let i = 0
    while (i < data.length) {
      const ch = data[i]!
      if (ch === '\x1b') {
        const csi = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(data.slice(i))
        if (csi !== null) {
          const raw = csi[1] ?? ''
          const n = raw === '' || raw === '?' ? 1 : Number(raw.split(';')[0])
          switch (csi[2]) {
            case 'A':
              this.row = Math.max(0, this.row - n)
              this.pendingWrap = false
              break
            case 'B':
              this.row += n
              this.ensure(this.row)
              this.pendingWrap = false
              break
            case 'C':
              this.col = Math.min(this.cols - 1, this.col + n)
              this.pendingWrap = false
              break
            case 'D':
              this.col = Math.max(0, this.col - n)
              this.pendingWrap = false
              break
            case 'K': {
              const from = csi[1] === '2' ? 0 : this.col
              const line = this.cells[this.row]!
              for (let x = from; x < this.cols; x += 1) line[x] = ' '
              break
            }
            case 'J':
              this.cells.length = 0
              this.cells.push(this.blank())
              this.row = 0
              this.col = 0
              break
            case 'H':
              this.row = 0
              this.col = 0
              break
            default:
              break
          }
          i += csi[0].length
          continue
        }
        const osc = /^\x1b\]8;;[^\x1b]*(?:\x1b\\|\x07)/.exec(data.slice(i))
        if (osc !== null) {
          i += osc[0].length
          continue
        }
        i += 1
        continue
      }
      if (ch === '\r') {
        this.col = 0
        this.pendingWrap = false
        i += 1
        continue
      }
      if (ch === '\n') {
        this.row += 1
        this.col = 0
        this.pendingWrap = false
        this.ensure(this.row)
        i += 1
        continue
      }
      const cp = data.codePointAt(i) ?? 0
      const glyph = String.fromCodePoint(cp)
      const width = displayWidth(glyph)
      if (width > 0) this.put(glyph, width)
      i += glyph.length
    }
  }

  /** Screen text with all spacing removed (wrapping splits at any column). */
  text(): string {
    return this.cells.map((row) => row.join('')).join('').replace(/\s+/gu, '')
  }
}

function fakeTty(cols: number, height: number): { out: NodeJS.WriteStream; screen: Screen } {
  const screen = new Screen(cols, height)
  const out = new Writable({
    write(chunk, _encoding, callback) {
      screen.feed(chunk.toString())
      callback()
    },
  }) as unknown as NodeJS.WriteStream
  Object.assign(out, { columns: cols, rows: height, isTTY: true })
  return { out, screen }
}

const paragraph =
  '**一句话**：商业漏扫负责“找漏洞”，开源验证平台负责“检验漏洞能否被利用”，两者串成一条自动完成闭环，再补一句让它超过任何终端宽度。'

function streaming(text: string): Message[] {
  return [{
    id: 'answer-1',
    kind: 'assistant',
    text,
    tool: undefined,
    createdAt: Date.now(),
    seq: 1,
    usage: undefined,
    streaming: true,
  }]
}

async function driveStream(cols: number, height: number): Promise<{ screen: Screen; expected: string }> {
  const { out, screen } = fakeTty(cols, height)
  const instance = render(<Transcript messages={streaming('')} />, { stdout: out, patchConsole: false })
  await new Promise((resolve) => setTimeout(resolve, 60))
  for (let n = 2; n <= paragraph.length; n += 2) {
    instance.rerender(<Transcript messages={streaming(paragraph.slice(0, n))} />)
    await new Promise((resolve) => setTimeout(resolve, 8))
  }
  await new Promise((resolve) => setTimeout(resolve, 80))
  instance.unmount()
  return { screen, expected: paragraph }
}

describe('terminal screen after a wrapped stream', () => {
  /** The markdown renderer drops the `**` emphasis markers; compare visible text. */
  const plain = (text: string): string => text.replace(/\*\*/gu, '').replace(/\s+/gu, '')

  it('keeps one copy of the text when lines wrap (narrow terminal)', async () => {
    const { screen, expected } = await driveStream(40, 24)
    const shown = screen.text()
    // Every visible character appears exactly once: duplicated fragments are
    // what the user saw as "方案## 方案 B 简介 B 简介".
    expect(shown.split('商业漏扫').length - 1).toBe(1)
    expect(shown).toContain(plain(expected).slice(0, 24))
    expect(shown).toContain(plain(expected).slice(-24))
  })

  it('keeps one copy when CJK content is wider than the terminal', async () => {
    const { screen, expected } = await driveStream(30, 20)
    const shown = screen.text()
    expect(shown.split('闭环').length - 1).toBe(1)
    expect(shown).toContain(plain(expected).slice(0, 24))
    expect(shown).toContain(plain(expected).slice(-24))
  })

  it('never leaves a stale fragment when a wrapped line shrinks', async () => {
    const { screen, expected } = await driveStream(28, 20)
    const shown = screen.text()
    // The full message survives as ONE contiguous run of characters: a stale
    // continuation row would split it and duplicate a fragment.
    expect(shown).toContain(plain(expected))
  })
})
