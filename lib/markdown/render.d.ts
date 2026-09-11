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
/**
 * Render a markdown source string to an ANSI-colored, word-wrapped text block.
 * The result is a single string with embedded `\n` separators — ready for an
 * Ink `<Text>` element to render verbatim.
 * @param source - markdown text from the model.
 * @returns ANSI-formatted terminal text.
 */
export declare function renderMarkdown(source: string): string;
/** Render the markdown source trimmed of any surrounding whitespace. */
export declare function renderInline_(source: string): string;
