/**
 * dsh-kiro markdown → plain-text renderer with ANSI color and box-drawing
 * tables. We deliberately avoid bringing React into the markdown path; the
 * Ink renderer composes this output as a single `<Text>` block so word-wrapping
 * and selection behavior match the rest of the transcript.
 *
 * The renderer is a faithful subset of CommonMark + GFM:
 *   - Headings (h1–h6) underlined in the accent color
 *   - Paragraphs and hard line breaks
 *   - Inline: emphasis, strong, code, links, strikethrough
 *   - Fenced and indented code blocks (syntax-highlighted via cli-highlight)
 *   - Block quotes
 *   - Ordered and unordered lists (nested)
 *   - GFM tables (rendered with box-drawing characters)
 *   - Horizontal rules
 *
 * @module @damomoashidamomo/dsh-kiro/markdown/render
 */

import { marked, type Tokens } from 'marked'
import { highlight } from 'cli-highlight'
import { palette } from '../theme/palette'

/** Maximum width for a wrapped line. */
const MAX_WIDTH = 100

/** Strip ANSI escape codes for length measurement. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

/** Terminal columns the renderer may use (set by the TUI each render). */
let markdownColumns: number | undefined

/** Tell the renderer the available pane width (display columns). */
export function setMarkdownColumns(columns: number | undefined): void {
  markdownColumns = columns !== undefined && Number.isFinite(columns) && columns > 20
    ? Math.floor(columns)
    : undefined
}

/** Effective render width: the TUI-provided pane width, else 100. */
function renderWidth(): number {
  return markdownColumns ?? MAX_WIDTH
}

/** Wide (CJK/fullwidth/Hangul) code point -> occupies 2 terminal columns. */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
}

/** Display width of visible text: CJK/fullwidth count as 2 columns. */
function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    width += isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1
  }
  return width
}

/** Break `text` into chunks of at most `width` display columns. */
function chunkByWidth(text: string, width: number): string[] {
  const chunks: string[] = []
  let current = ''
  let currentWidth = 0
  for (const ch of text) {
    const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1
    if (currentWidth + cw > width && current !== '') {
      chunks.push(current)
      current = ch
      currentWidth = cw
    } else {
      current += ch
      currentWidth += cw
    }
  }
  chunks.push(current)
  return chunks
}

/** Wrap a single visible-text line at MAX_WIDTH, preserving ANSI codes. */
function wrapAnsi(text: string, width = MAX_WIDTH): string[] {
  if (text === '') return ['']
  const lines: string[] = []
  const tokens: Array<{ ansi: string; plain: string }> = []
  const re = /(\x1b\[[0-9;]*m)|([^\x1b]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match[1] !== undefined) tokens.push({ ansi: match[1], plain: '' })
    else if (match[2] !== undefined) tokens.push({ ansi: '', plain: match[2] })
  }
  let plainBuf = ''
  let pendingAnsi = ''
  let visibleLen = 0
  const flush = (): void => {
    if (plainBuf === '' && pendingAnsi === '') return
    lines.push(pendingAnsi + plainBuf)
    plainBuf = ''
    pendingAnsi = ''
    visibleLen = 0
  }
  for (const token of tokens) {
    if (token.ansi !== '') {
      pendingAnsi = token.ansi
      continue
    }
    for (const ch of token.plain) {
      if (ch === '\n') {
        flush()
        lines.push('')
        continue
      }
      const charWidth = displayWidth(ch)
      if (visibleLen + charWidth > width && ch !== ' ') {
        // Wrap on word boundary if possible.
        const spaceIdx = plainBuf.lastIndexOf(' ')
        if (spaceIdx > width * 0.6) {
          const head = plainBuf.slice(0, spaceIdx)
          const tail = plainBuf.slice(spaceIdx + 1)
          lines.push(pendingAnsi + head)
          plainBuf = tail + ch
          visibleLen = displayWidth(tail + ch)
        } else {
          lines.push(pendingAnsi + plainBuf)
          plainBuf = ch
          visibleLen = charWidth
        }
      } else {
        plainBuf += ch
        visibleLen += charWidth
      }
    }
  }
  flush()
  return lines.length === 0 ? [''] : lines
}

/** Pad `text` with spaces to `width` display columns. */
function pad(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const len = displayWidth(stripAnsi(text))
  if (len >= width) return text
  const gap = width - len
  if (align === 'right') return ' '.repeat(gap) + text
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + text + ' '.repeat(gap - left)
  }
  return text + ' '.repeat(gap)
}

/** Render a fenced code block with cli-highlight syntax coloring. */
function renderCode(token: Tokens.Code, maxWidth?: number): string {
  let highlighted = token.text
  try {
    highlighted = highlight(token.text, {
      language: token.lang ?? 'text',
      ignoreIllegals: true,
    })
  } catch {
    highlighted = token.text
  }
  const codeCap = Math.max(20, (maxWidth ?? renderWidth()) - 6)
  // Wide lines TRUNCATE (code alignment beats completeness; the spill path
  // and the read tool carry full content when needed). Truncation walks
  // code points so wide (CJK) characters are never split in half.
  const truncateToWidth = (line: string): string => {
    const visible = stripAnsi(line)
    if (displayWidth(visible) <= codeCap) return line
    let taken = ''
    let takenWidth = 0
    for (const ch of visible) {
      const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1
      if (takenWidth + cw > codeCap - 1) break
      taken += ch
      takenWidth += cw
    }
    return `${taken}…`
  }
  const lines = highlighted.split('\n').map(truncateToWidth)
  // Box-drawing frame: top + body + bottom.
  const visibleWidth = Math.min(
    (maxWidth ?? renderWidth()) - 6,
    Math.max(...lines.map(line => displayWidth(stripAnsi(line))), 1),
  )
  const frame = '─'.repeat(visibleWidth + 2)
  const header = token.lang !== undefined && token.lang !== ''
    ? palette.dim(` ╭─ ${token.lang} `) + palette.dim('─'.repeat(Math.max(0, visibleWidth + 2 - 5 - token.lang.length)))
    : palette.dim(` ╭${frame}╮`)
  const body = lines.map(line => {
    const visible = displayWidth(stripAnsi(line))
    const padLen = Math.max(0, visibleWidth - visible)
    return palette.dim(' │ ') + line + ' '.repeat(padLen) + palette.dim(' │')
  }).join('\n')
  const footer = palette.dim(` ╰${frame}╯`)
  return `${header}\n${body}\n${footer}`
}

/** Render a heading with an underline. */
function renderHeading(token: Tokens.Heading): string {
  const level = Math.min(Math.max(token.depth, 1), 6)
  const text = renderInline(token.tokens ?? [])
  const hashes = '#'.repeat(level)
  if (level <= 2) {
    return palette.heading(`${hashes} ${text}`) + '\n' + palette.accent('─'.repeat(stripAnsi(text).length + level + 1))
  }
  return palette.heading(`${hashes} ${text}`)
}


/** marked escapes text tokens for HTML (&#39; &quot; ...) — the terminal
 * wants the original characters back. */
function unescapeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => {
      const map: Record<string, string> = {
        amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ',
      }
      return map[name] ?? name
    })
    .replace(/&#(\d{1,7});/g, (_, code: string) => {
      const parsed = Number.parseInt(code, 10)
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : `&#${code};`
    })
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, code: string) => {
      const parsed = Number.parseInt(code, 16)
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : `&#x${code};`
    })
}

/** Render an inline token sequence. */
function renderInline(tokens: Tokens.Generic[]): string {
  return tokens.map(token => renderInlineToken(token)).join('')
}

/** Render a single inline token. */
function renderInlineToken(token: Tokens.Generic): string {
  switch (token.type) {
    case 'text':
      return token.tokens !== undefined && token.tokens.length > 0
        ? renderInline(token.tokens)
        : unescapeEntities((token as Tokens.Text).text)
    case 'strong':
      return palette.bold(renderInline(token.tokens ?? []))
    case 'em':
      return palette.italic(renderInline(token.tokens ?? []))
    case 'del':
      return `\x1b[9m${renderInline(token.tokens ?? [])}\x1b[29m`
    case 'codespan': {
      const code = unescapeEntities((token as Tokens.Codespan).text)
      return palette.code(` ${code} `)
    }
    case 'link': {
      const link = token as Tokens.Link
      return `${palette.link(renderInline(link.tokens))} ${palette.dim(`(${unescapeEntities(link.href)})`)}`
    }
    case 'image': {
      const image = token as Tokens.Image
      return palette.accent(`[image: ${image.href}]`)
    }
    case 'br':
      return '\n'
    case 'escape':
      return unescapeEntities((token as Tokens.Escape).text)
    case 'html':
      return (token as unknown as { text: string }).text
    default:
      return ''
  }
}

/** Render a block quote. */
function renderBlockquote(token: Tokens.Blockquote): string {
  const inner = renderTokens(token.tokens).split('\n')
  return inner.map(line => palette.accentSoft(' │ ') + line).join('\n')
}

/** Render an unordered list. */
function renderList(token: Tokens.List): string {
  const ordered = token.ordered
  return token.items.map((item, idx) => {
    const bullet = ordered ? `${idx + 1}.` : '•'
    const lines = renderTokens(item.tokens).split('\n')
    const head = `${palette.muted(bullet)} ${lines[0] ?? ''}`
    const tail = lines.slice(1).map(line => `  ${line}`)
    return [head, ...tail].join('\n')
  }).join('\n')
}

/**
 * Render a GFM table — kiro-cli style: no enclosing box borders, just
 * colored column headers, a thin separator, and pipe-separated data rows.
 * Column widths use DISPLAY width (CJK = 2 columns); the whole table caps
 * to the available pane width by scaling columns down and WRAPPING cell
 * content into multiple physical lines.
 */
function renderTable(token: Tokens.Table, maxWidth?: number): string {
  const alignments = token.align
  const headerCells = token.header.map(cell => renderInline(cell.tokens))
  const rows = token.rows.map(row => row.map(cell => renderInline(cell.tokens)))

  // Natural display width per column.
  const natural = headerCells.map((cell, i) =>
    Math.max(
      displayWidth(stripAnsi(cell)),
      ...rows.map(row => displayWidth(stripAnsi(row[i] ?? ''))),
      1,
    ),
  )

  // Scale columns to fit the pane (separator cost: 3 per column + 1).
  const overhead = natural.length * 3 + 1
  const cap = Math.max(20, (maxWidth ?? renderWidth()) - 2)
  const widths = (() => {
    const total = natural.reduce((a, b) => a + b, 0)
    if (total + overhead <= cap) return natural
    const scale = (cap - overhead) / total
    const scaled = natural.map(width => Math.max(4, Math.floor(width * scale)))
    const stillOver = scaled.reduce((a, b) => a + b, 0) + overhead - cap
    if (stillOver > 0) {
      const widest = scaled.indexOf(Math.max(...scaled))
      scaled[widest] = Math.max(4, scaled[widest]! - stillOver)
    }
    return scaled
  })()

  const wrapCell = (text: string, i: number): string[] => {
    const plain = stripAnsi(text)
    const width = Math.max(1, (widths[i] ?? 1))
    return chunkByWidth(plain, width).map(chunk => pad(chunk, width))
  }

  // Header row: bold accent.
  const headerLine = palette.bold(
    headerCells.map((cell, i) => pad(stripAnsi(cell), widths[i] ?? 0, alignments[i] ?? 'left'))
      .join(palette.dim(' │ ')),
  )
  // Thin separator.
  const separator = palette.dim(widths.map(width => '─'.repeat(Math.max(3, width))).join('─┼─'))
  // Data rows: pipe-separated, clean.
  const dataLines = rows.flatMap(row => {
    const cellLines = row.map((cell, i) => wrapCell(cell, i))
    const height = Math.max(...cellLines.map(lines => lines.length), 1)
    const lines: string[] = []
    for (let line = 0; line < height; line += 1) {
      const segments = cellLines.map((cls, i) =>
        pad(cls[line] ?? '', widths[i] ?? 0, alignments[i] ?? 'left'),
      )
      lines.push(segments.join(palette.dim(' │ ')))
    }
    return lines
  })

  return [headerLine, separator, ...dataLines].join('\n')
}

/** Render any sequence of block tokens. */
function renderTokens(tokens: Tokens.Generic[], maxWidth?: number): string {
  return tokens.map(token => renderBlock(token, maxWidth)).join('\n\n')
}

/** Render a single block token. */
function renderBlock(token: Tokens.Generic, maxWidth?: number): string {
  switch (token.type) {
    case 'heading':
      return renderHeading(token as Tokens.Heading)
    case 'paragraph':
      return renderInline(token.tokens ?? [])
    case 'code':
      return renderCode(token as Tokens.Code, maxWidth)
    case 'blockquote':
      return renderBlockquote(token as Tokens.Blockquote)
    case 'table':
      return renderTable(token as Tokens.Table, maxWidth)
    case 'list':
      return renderList(token as Tokens.List)
    case 'hr':
      return palette.dim('─'.repeat(Math.min(MAX_WIDTH, renderWidth())))
    case 'space':
      return ''
    default:
      return renderInline([token])
  }
}

/**
 * Render a markdown source string to an ANSI-colored, word-wrapped text block.
 * The result is a single string with embedded `\n` separators — ready for an
 * Ink `<Text>` element to render verbatim.
 * @param source - markdown text from the model.
 * @returns ANSI-formatted terminal text.
 */
export function renderMarkdown(source: string): string {
  if (source === '') return ''
  const tokens = marked.lexer(source)
  const width = renderWidth()
  const rendered = renderTokens(tokens, width)
  return wrapAnsi(rendered, width).join('\n')
}

/** Render the markdown source trimmed of any surrounding whitespace. */
export function renderInline_(source: string): string {
  if (source === '') return ''
  return renderInline(marked.lexer(source).flatMap(t => t.type === 'paragraph' ? t.tokens ?? [] : [t]))
}
