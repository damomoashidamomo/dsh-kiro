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
      if (visibleLen >= width && ch !== ' ') {
        // Wrap on word boundary if possible.
        const spaceIdx = plainBuf.lastIndexOf(' ')
        if (spaceIdx > width * 0.6) {
          const head = plainBuf.slice(0, spaceIdx)
          const tail = plainBuf.slice(spaceIdx + 1)
          lines.push(pendingAnsi + head)
          plainBuf = tail + ch
          visibleLen = stripAnsi(tail + ch).length
        } else {
          lines.push(pendingAnsi + plainBuf)
          plainBuf = ch
          visibleLen = 1
        }
      } else {
        plainBuf += ch
        visibleLen += 1
      }
    }
  }
  flush()
  return lines.length === 0 ? [''] : lines
}

/** Pad `text` with spaces to `width` visible columns. */
function pad(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const len = stripAnsi(text).length
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
function renderCode(token: Tokens.Code): string {
  let highlighted = token.text
  try {
    highlighted = highlight(token.text, {
      language: token.lang ?? 'text',
      ignoreIllegals: true,
    })
  } catch {
    highlighted = token.text
  }
  const lines = highlighted.split('\n')
  // Box-drawing frame: top + body + bottom.
  const visibleWidth = Math.min(
    MAX_WIDTH - 4,
    Math.max(...lines.map(line => stripAnsi(line).length), 1),
  )
  const frame = '─'.repeat(visibleWidth + 2)
  const header = token.lang !== undefined && token.lang !== ''
    ? palette.dim(` ╭─ ${token.lang} `) + palette.dim('─'.repeat(Math.max(0, visibleWidth + 2 - 5 - token.lang.length)))
    : palette.dim(` ╭${frame}╮`)
  const body = lines.map(line => {
    const visible = stripAnsi(line)
    const padLen = Math.max(0, visibleWidth - visible.length)
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
        : (token as Tokens.Text).text
    case 'strong':
      return palette.bold(renderInline(token.tokens ?? []))
    case 'em':
      return palette.italic(renderInline(token.tokens ?? []))
    case 'del':
      return `\x1b[9m${renderInline(token.tokens ?? [])}\x1b[29m`
    case 'codespan': {
      const code = (token as Tokens.Codespan).text
      return palette.code(` ${code} `)
    }
    case 'link': {
      const link = token as Tokens.Link
      return `${palette.link(renderInline(link.tokens))} ${palette.dim(`(${link.href})`)}`
    }
    case 'image': {
      const image = token as Tokens.Image
      return palette.accent(`[image: ${image.href}]`)
    }
    case 'br':
      return '\n'
    case 'escape':
      return (token as Tokens.Escape).text
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

/** Render a GFM table. */
function renderTable(token: Tokens.Table): string {
  const headerCells = token.header.map(cell => renderInline(cell.tokens))
  const alignments = token.align
  const widths = headerCells.map((cell, i) =>
    Math.max(
      stripAnsi(cell).length,
      ...token.rows.map(row => {
        const c = row[i]
        const text = c !== undefined ? renderInline(c.tokens) : ''
        return stripAnsi(text).length
      }),
    ),
  )
  const sepCells = widths.map((width, i) => {
    const align = alignments[i] ?? 'left'
    const bar = '─'.repeat(Math.max(3, width))
    if (align === 'right') return `${palette.dim(':')}${bar.slice(1)}${palette.dim(':')}`
    if (align === 'center') return `${palette.dim(':')}${bar.slice(1, -1)}${palette.dim(':')}`
    return `${palette.dim(bar)}`
  })
  const headerLine = palette.dim('│ ') + headerCells.map((cell, i) => pad(palette.heading(cell), widths[i] ?? 0, alignments[i] ?? 'left')).join(palette.dim(' │ ')) + palette.dim(' │')
  const sepLine = palette.dim(`├─${sepCells.join('─┼─')}─┤`)
  const bodyLines = token.rows.map(row =>
    palette.dim('│ ') + row.map((cell, i) => pad(renderInline(cell.tokens), widths[i] ?? 0, alignments[i] ?? 'left')).join(palette.dim(' │ ')) + palette.dim(' │'),
  )
  const top = palette.dim(`┌─${widths.map(width => '─'.repeat(width)).join('─┬─')}─┐`)
  const bottom = palette.dim(`└─${widths.map(width => '─'.repeat(width)).join('─┴─')}─┘`)
  return [top, headerLine, sepLine, ...bodyLines, bottom].join('\n')
}

/** Render any sequence of block tokens. */
function renderTokens(tokens: Tokens.Generic[]): string {
  return tokens.map(renderBlock).join('\n\n')
}

/** Render a single block token. */
function renderBlock(token: Tokens.Generic): string {
  switch (token.type) {
    case 'heading':
      return renderHeading(token as Tokens.Heading)
    case 'paragraph':
      return renderInline(token.tokens ?? [])
    case 'code':
      return renderCode(token as Tokens.Code)
    case 'blockquote':
      return renderBlockquote(token as Tokens.Blockquote)
    case 'list':
      return renderList(token as Tokens.List)
    case 'table':
      return renderTable(token as Tokens.Table)
    case 'hr':
      return palette.dim('─'.repeat(MAX_WIDTH))
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
  const rendered = renderTokens(tokens)
  return wrapAnsi(rendered).join('\n')
}

/** Render the markdown source trimmed of any surrounding whitespace. */
export function renderInline_(source: string): string {
  if (source === '') return ''
  return renderInline(marked.lexer(source).flatMap(t => t.type === 'paragraph' ? t.tokens ?? [] : [t]))
}
