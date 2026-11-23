/**
 * 0.9.10 — oversize code lines WRAP instead of silently truncating.
 *
 * User report that drove this: a real `helm get values ... | python3 -c '...'`
 * one-liner rendered as `…` — half the command simply did not exist on screen,
 * so it could not be read, checked, or rectangle-selected. Truncation traded
 * visibility for alignment; 0.9.10 keeps the text and marks continuation with a
 * trailing backslash (paste-exact copying still goes through /copy → OSC 52).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { renderMarkdown, displayWidth, stripAnsi, setMarkdownColumns } from '../src/markdown/render'

afterEach(() => {
  setMarkdownColumns(undefined)
})

/** The real-world shape that broke: one command line, ~170 columns, no backslashes. */
const ONE_LINER = [
  "helm get values difyaas -n difyaas -a -o json | python3 -c 'import json,sys;",
  "d=json.load(sys.stdin);print(sorted(d.keys()));print(len(d))'",
].join(' ')
// Joined without a real newline so it stays a single ~170-column source line.
const SINGLE = ONE_LINER.replace(/\n/gu, ' ')

/** Undo the `\` continuation marker the renderer adds to wrapped segments. */
function joinWrapped(lines: string[]): string {
  return lines
    .map((line) => stripAnsi(line).trim())
    .map((line, index, all) => (index < all.length - 1 && line.endsWith('\\') ? line.slice(0, -1) : line))
    .join('')
}

describe('code block line wrapping (0.9.10)', () => {
  it('renders a >100-col command in full on screen, never as …', () => {
    expect(displayWidth(SINGLE)).toBeGreaterThan(100)
    const out = renderMarkdown(['```bash', SINGLE, '```'].join('\n'))
    // 绝不静默截断
    expect(out).not.toContain('…')
    const lines = out.split('\n').filter((line) => line.trim() !== '')
    // 折行成多行，且除最后一行外都带续行标记
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines.slice(0, -1)) {
      expect(stripAnsi(line).trimEnd().endsWith('\\')).toBe(true)
    }
    // 去掉续行标记后可无损还原原文（一字不差）
    expect(joinWrapped(lines)).toBe(SINGLE)
  })

  it('keeps every wrapped segment inside the pane (no overflow)', () => {
    setMarkdownColumns(100)
    const out = renderMarkdown(['```bash', SINGLE, '```'].join('\n'))
    const lines = out.split('\n').filter((line) => line.trim() !== '')
    for (const line of lines) {
      // codeCap = width - 6 = 94；折行段 ≤ 94 + 1（续行标记）
      expect(displayWidth(line)).toBeLessThanOrEqual(95)
    }
    // 折行是"看得见"，代价是粘贴会带标记——所以精确复制仍然走 /copy
    expect(joinWrapped(lines)).toBe(SINGLE)
  })

  it('respects a narrower pane by wrapping into more segments', () => {
    const count = (columns: number): string[] => {
      setMarkdownColumns(columns)
      return renderMarkdown(['```bash', SINGLE, '```'].join('\n'))
        .split('\n')
        .filter((line) => line.trim() !== '')
    }
    const narrow = count(60)
    const mid = count(100)
    const wide = count(200)
    // 窄面板 → 更多折行段；足够宽 → 单行不折
    expect(narrow.length).toBeGreaterThan(mid.length)
    expect(mid.length).toBeGreaterThan(wide.length)
    expect(wide.length).toBe(1)
    // 任何宽度下都能无损还原原文
    for (const lines of [narrow, mid, wide]) expect(joinWrapped(lines)).toBe(SINGLE)
  })

  it('leaves short command lines untouched (no markers, no reflow)', () => {
    const md = ['```bash', 'kubectl get nodes', 'uptime', '```'].join('\n')
    const out = renderMarkdown(md)
    expect(out.split('\n').filter((line) => line.trim() !== '')).toEqual(['kubectl get nodes', 'uptime'])
    expect(out).not.toContain('\\')
  })

  it('wide (CJK) characters never get split across a wrap boundary', () => {
    const cjk = `echo ${'宽字符测试'.repeat(20)}`
    const out = renderMarkdown(['```bash', cjk, '```'].join('\n'))
    const lines = out.split('\n').filter((line) => line.trim() !== '')
    expect(lines.length).toBeGreaterThan(1)
    // 还原后仍与原文一致 → 没有字符被切断丢弃
    expect(joinWrapped(lines)).toBe(cjk)
  })
})
