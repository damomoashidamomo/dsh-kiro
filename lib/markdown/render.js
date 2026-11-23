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
import { marked } from 'marked';
import { highlight } from 'cli-highlight';
import { palette } from "../theme/palette.js";
/** Maximum width for a wrapped line. */
const MAX_WIDTH = 100;
/**
 * OSC 8 terminal hyperlink: terminals that support it (Windows Terminal,
 * iTerm2, Kitty, WezTerm…) make the text Ctrl+clickable; others render the
 * visible text unchanged and ignore the escape.
 */
function hyperlink(text, url) {
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}
/** Wrap bare http(s) URLs found in plain text as clickable links. */
function autolinkText(text) {
    const re = /(https?:\/\/[^\s<>()\[\]{}"']+)/gu;
    return text.replace(re, (url) => hyperlink(palette.link(url), url));
}
/** Strip ANSI escape codes for length measurement. */
/** Strip SGR colors and OSC 8 envelopes. */
export function stripAnsi(text) {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m|\x1b\]8;;[^\x1b]*\x1b\\/g, '');
}
/** Terminal columns the renderer may use (set by the TUI each render). */
let markdownColumns;
/** Tell the renderer the available pane width (display columns). */
export function setMarkdownColumns(columns) {
    markdownColumns = columns !== undefined && Number.isFinite(columns) && columns > 20
        ? Math.floor(columns)
        : undefined;
}
/** Effective render width: the TUI-provided pane width, else 100. */
function renderWidth() {
    return markdownColumns ?? MAX_WIDTH;
}
/** Wide (CJK/fullwidth/Hangul) code point -> occupies 2 terminal columns. */
function isWideCodePoint(cp) {
    return ((cp >= 0x1100 && cp <= 0x115f) ||
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
        (cp >= 0x20000 && cp <= 0x3fffd));
}
/** Display width of visible text: CJK/fullwidth count as 2 columns. */
/** Visible width of text: CJK/fullwidth count as 2 columns, ANSI ignored. */
export function displayWidth(text) {
    // Strip HERE, not at the call sites: styled strings (truecolor SGR is a
    // dozen bytes per span) otherwise measured their escape bytes as columns —
    // a 5-column `0% > ` gutter measured 24 and every caret position derived
    // from it overflowed and clamped to the line end.
    let width = 0;
    for (const ch of stripAnsi(text)) {
        width += isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
    }
    return width;
}
/** Break `text` into chunks of at most `width` display columns. */
/** 超过此列数的表降级为行卡片渲染（方案 B 阈值）。 */
const CARD_COLUMN_LIMIT = 6;
/** Slice by DISPLAY width (CJK = 2), keeping the leading columns. */
function sliceByWidth(text, width) {
    let used = 0;
    let out = '';
    for (const ch of text) {
        const w = displayWidth(ch);
        if (used + w > width)
            break;
        out += ch;
        used += w;
    }
    return out;
}
function chunkByWidth(text, width) {
    const chunks = [];
    let current = '';
    let currentWidth = 0;
    for (const ch of text) {
        const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
        if (currentWidth + cw > width && current !== '') {
            chunks.push(current);
            current = ch;
            currentWidth = cw;
        }
        else {
            current += ch;
            currentWidth += cw;
        }
    }
    chunks.push(current);
    return chunks;
}
/**
 * Wrap a single visible-text line at `width` display columns, preserving
 * ANSI in exact stream order. Escape tokens (SGR colors AND OSC 8 hyperlink
 * envelopes) are emitted verbatim with zero visible width — the previous
 * pendingAnsi-prefix design OVERWROTE consecutive escapes, which silently
 * dropped link openings.
 */
/** Wrap a styled line at `width` columns; escapes kept verbatim, zero width. */
export function wrapAnsi(text, width = MAX_WIDTH) {
    const lines = [];
    let current = '';
    let lineWidth = 0;
    const flush = () => {
        lines.push(current);
        current = '';
        lineWidth = 0;
    };
    // SGR colors or OSC 8 envelopes: one opaque token, emitted as-is.
    const re = /(\x1b\[[0-9;]*m|\x1b\]8;;[^\x1b]*\x1b\\)|([^\x1b]+)/g;
    let match;
    while ((match = re.exec(text)) !== null) {
        const ansi = match[1];
        if (ansi !== undefined) {
            current += ansi;
            continue;
        }
        const plain = match[2] ?? '';
        for (const ch of plain) {
            if (ch === '\n') {
                flush();
                continue;
            }
            const cw = displayWidth(ch);
            if (lineWidth + cw > width && lineWidth > 0) {
                // Prefer a word boundary inside the visible text.
                const spaceIdx = current.lastIndexOf(' ');
                if (spaceIdx > current.length * 0.6) {
                    const head = current.slice(0, spaceIdx);
                    const tail = current.slice(spaceIdx + 1);
                    lines.push(head);
                    current = tail + ch;
                    lineWidth = displayWidth(stripAnsi(tail + ch));
                }
                else {
                    flush();
                    current = ch;
                    lineWidth = cw;
                }
            }
            else {
                current += ch;
                lineWidth += cw;
            }
        }
    }
    if (current !== '' || lines.length === 0)
        lines.push(current);
    return lines;
}
/** Pad `text` with spaces to `width` display columns. */
function pad(text, width, align = 'left') {
    const len = displayWidth(stripAnsi(text));
    if (len >= width)
        return text;
    const gap = width - len;
    if (align === 'right')
        return ' '.repeat(gap) + text;
    if (align === 'center') {
        const left = Math.floor(gap / 2);
        return ' '.repeat(left) + text + ' '.repeat(gap - left);
    }
    return text + ' '.repeat(gap);
}
/** Render a fenced code block with cli-highlight syntax coloring. */
function renderCode(token, maxWidth) {
    let highlighted = token.text;
    try {
        highlighted = highlight(token.text, {
            language: token.lang ?? 'text',
            ignoreIllegals: true,
        });
    }
    catch {
        highlighted = token.text;
    }
    const codeCap = Math.max(20, (maxWidth ?? renderWidth()) - 6);
    // 0.9.10：超宽行折行显示而非静默截断——截断让 200+ 列命令在屏幕上消失
    // 一半，用户完全无法核对（实测：helm|python -c 一条命令只剩前半）。折行
    // 末尾留 `\` 视觉续行标记；粘贴请用 /copy（OSC 52 取原文，无折行）。
    const wrapWide = (line) => {
        const visible = stripAnsi(line);
        if (displayWidth(visible) <= codeCap)
            return [line];
        const out = [];
        let cur = '';
        let curWidth = 0;
        for (const ch of visible) {
            const cw = isWideCodePoint(ch.codePointAt(0) ?? 0) ? 2 : 1;
            if (curWidth + cw > codeCap - 1) {
                out.push(`${cur}\\`);
                cur = '';
                curWidth = 0;
            }
            cur += ch;
            curWidth += cw;
        }
        if (cur !== '')
            out.push(cur);
        return out;
    };
    const lines = highlighted.split('\n').flatMap(wrapWide);
    // 0.9.6 方案 A：无边框代码块——语法高亮保留，语言角标做视觉分隔。
    // 旧实现的 ╭─╮│╰ 盒子会污染终端矩形选择（复制命令带着 │ 前缀和框线，
    // 用户工程场景"贴到目标终端"每次都要手动清理）。裸文本行 + 固定缩进，
    // 矩形选择即得干净命令；角标 `▌ bash` 灰色低调不抢高亮。
    // 0.9.8：零装饰顶格——无角标、无缩进（用户全屏框选复制诉求：
    // 粘贴产物要么 # 注释要么可执行命令，任何装饰行/前导空格都碍事）。
    // 语法高亮保留。
    return lines.join('\n');
}
/** Render a heading with an underline. */
function renderHeading(token) {
    const level = Math.min(Math.max(token.depth, 1), 6);
    const text = renderInline(token.tokens ?? []);
    const hashes = '#'.repeat(level);
    void level;
    // 0.9.8：标题不再画下划线（横线是屏幕全选复制时的污染源）。
    return palette.heading(`${hashes} ${text}`);
    return palette.heading(`${hashes} ${text}`);
}
/** marked escapes text tokens for HTML (&#39; &quot; ...) — the terminal
 * wants the original characters back. */
function unescapeEntities(text) {
    return text
        .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name) => {
        const map = {
            amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ',
        };
        return map[name] ?? name;
    })
        .replace(/&#(\d{1,7});/g, (_, code) => {
        const parsed = Number.parseInt(code, 10);
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : `&#${code};`;
    })
        .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, code) => {
        const parsed = Number.parseInt(code, 16);
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : `&#x${code};`;
    });
}
/** Render an inline token sequence. */
function renderInline(tokens) {
    return tokens.map(token => renderInlineToken(token)).join('');
}
/** Render a single inline token. */
function renderInlineToken(token) {
    switch (token.type) {
        case 'text':
            return token.tokens !== undefined && token.tokens.length > 0
                ? renderInline(token.tokens)
                : autolinkText(unescapeEntities(token.text));
        case 'strong':
            return palette.bold(renderInline(token.tokens ?? []));
        case 'em':
            return palette.italic(renderInline(token.tokens ?? []));
        case 'del':
            return `\x1b[9m${renderInline(token.tokens ?? [])}\x1b[29m`;
        case 'codespan': {
            const code = unescapeEntities(token.text);
            return palette.code(` ${code} `);
        }
        case 'link': {
            const link = token;
            const href = unescapeEntities(link.href);
            // GFM autolinks a bare URL: label text equals the href. Render it once
            // from the raw href so the label is not double-wrapped by autolinkText.
            const labelText = unescapeEntities(link.tokens.map(t => t.text ?? '').join('')).trim();
            if (labelText === href)
                return hyperlink(palette.link(href), href);
            const label = hyperlink(palette.link(renderInline(link.tokens)), href);
            return `${label} ${hyperlink(palette.dim(`(${href})`), href)}`;
        }
        case 'image': {
            const image = token;
            return palette.accent(`[image: ${image.href}]`);
        }
        case 'br':
            return '\n';
        case 'escape':
            return unescapeEntities(token.text);
        case 'html':
            return token.text;
        default:
            return '';
    }
}
/** Render a block quote. */
function renderBlockquote(token) {
    const inner = renderTokens(token.tokens).split('\n');
    return inner.map(line => palette.accentSoft(' │ ') + line).join('\n');
}
/** Render an unordered list. */
function renderList(token) {
    const ordered = token.ordered;
    return token.items.map((item, idx) => {
        const bullet = ordered ? `${idx + 1}.` : '•';
        const lines = renderTokens(item.tokens).split('\n');
        const head = `${palette.muted(bullet)} ${lines[0] ?? ''}`;
        const tail = lines.slice(1).map(line => `  ${line}`);
        return [head, ...tail].join('\n');
    }).join('\n');
}
/**
 * Render a GFM table — kiro-cli style: no enclosing box borders, just
 * colored column headers, a thin separator, and pipe-separated data rows.
 * Column widths use DISPLAY width (CJK = 2 columns); the whole table caps
 * to the available pane width by scaling columns down and WRAPPING cell
 * content into multiple physical lines.
 */
function renderTable(token, maxWidth) {
    // 0.9.4 方案 B：列数 > CARD_COLUMN_LIMIT 时整表降级为「行卡片」——
    // 8 列 CJK 表在任何 ~100 列终端里数学上无解（均摊每列 ~8），与其碎片
    // 化不如逐行卡片化（字段: 值 竖排），永不溢出。≤6 列走智能预算表格。
    const columnCount = token.header.length;
    if (columnCount > CARD_COLUMN_LIMIT)
        return renderTableAsCards(token);
    return renderTableGrid(token, maxWidth);
}
/** Wide-table fallback: one card per row, field-per-line. */
function renderTableAsCards(token) {
    const header = token.header.map(cell => renderInline(cell.tokens));
    const cards = token.rows.map((row, rowIdx) => {
        const lines = row.map((cell, i) => {
            const label = stripAnsi(header[i] ?? `列${i + 1}`).trim();
            const value = renderInline(cell.tokens).replace(/\s+/gu, ' ').trim();
            return `  ${palette.bold(label)}${palette.dim('：')}${value}`;
        });
        return [`${palette.accent('▸')} ${palette.bold(`#${rowIdx + 1}`)}`, ...lines].join('\n');
    });
    return cards.join('\n\n');
}
function renderTableGrid(token, maxWidth) {
    const alignments = token.align;
    const headerCells = token.header.map(cell => renderInline(cell.tokens));
    const rows = token.rows.map(row => row.map(cell => renderInline(cell.tokens)));
    // Natural display width per column.
    const natural = headerCells.map((cell, i) => Math.max(displayWidth(stripAnsi(cell)), ...rows.map(row => displayWidth(stripAnsi(row[i] ?? ''))), 1));
    // ── 0.9.4 智能列预算（方案 A）──────────────────────────────────────────
    // 瘦列（✅/❌/短词/数字/价格）永不换行：按自然宽 + 2 预留，超宽截断加 …；
    // 换行预算只留给最“胖”的 1-2 列（描述/链接类）。旧实现等比压缩全列换行，
    // 8 列 CJK 表每格折 3-6 行——用户实测“表格碎片化不可读”的根源。
    const THIN_MAX = 12; // 自然宽 ≤12 视为瘦列候选
    const FAT_COUNT = 3; // 最多 3 个胖列吸收全部换行预算
    const MID_MIN = 8; // 中列下限（低于此宁可整表更窄）
    const overhead = natural.length * 3 + 1;
    const cap = Math.max(20, (maxWidth ?? renderWidth()) - 2);
    const total = natural.reduce((a, b) => a + b, 0);
    const widths = (() => {
        if (total + overhead <= cap)
            return natural;
        // 瘦列集合：自然宽小且不含长词（无空格长串会被硬切，跳过）
        const isThin = natural.map((w, i) => {
            if (w > THIN_MAX)
                return false;
            const sample = [headerCells[i] ?? '', ...rows.slice(0, 3).map(r => r[i] ?? '')].join(' ');
            const longestWord = Math.max(0, ...sample.split(/\s+/u).filter(Boolean).map(word => displayWidth(word)));
            return longestWord <= THIN_MAX;
        });
        // 胖列 = 非瘦列里自然宽最大的 FAT_COUNT 个；其余为“中列”（1-2 行封顶）
        const fatCandidates = natural
            .map((w, i) => ({ w, i, thin: isThin[i] ?? false }))
            .filter(c => !c.thin)
            .sort((a, b) => b.w - a.w);
        const fatSet = new Set(fatCandidates.slice(0, FAT_COUNT).map(c => c.i));
        // 预算分配（0.9.4 v2）：瘦列自然宽+1（不参与压缩）；中列 min(自然宽,14)
        // 且 ≥ MID_MIN；剩余全部给胖列均分（下限 10，不够就从瘦列截断里扣）。
        const thinTotal = natural.reduce((sum, w, i) => sum + ((isThin[i] ?? false) ? Math.min(w, THIN_MAX) + 1 : 0), 0);
        const mids = natural.map((w, i) => ({ w, i, thin: isThin[i] ?? false }))
            .filter(c => !c.thin && !fatSet.has(c.i))
            .map(c => Math.max(MID_MIN, Math.min(c.w, 14)));
        const midBudget = mids.reduce((a, b) => a + b, 0);
        const fatBudget = Math.max(10, cap - overhead - thinTotal - midBudget);
        const fatCountReal = Math.max(1, fatSet.size);
        return natural.map((w, i) => {
            if (isThin[i] ?? false)
                return Math.min(w, THIN_MAX) + 1;
            if (fatSet.has(i))
                return Math.floor(fatBudget / fatCountReal);
            return Math.max(MID_MIN, Math.min(w, 14));
        });
    })();
    /** 瘦列截断（单行 + …）；胖/中列正常换行。 */
    const wrapCell = (text, i) => {
        const plain = stripAnsi(text);
        const width = Math.max(1, (widths[i] ?? 1));
        const single = plain.replace(/\s+/gu, ' ').trim();
        if (displayWidth(single) <= width)
            return [pad(single, width)];
        if (width >= 4 && displayWidth(single) > width && natural[i] !== undefined && natural[i] <= THIN_MAX) {
            // 瘦列超宽：截断加 …（内容短但比分配宽——只在整体超宽时发生）
            const clipped = sliceByWidth(single, width - 1);
            return [pad(`${clipped}…`, width)];
        }
        return chunkByWidth(plain, width).map(chunk => pad(chunk, width));
    };
    // Header row: bold accent.
    const headerLine = palette.bold(headerCells.map((cell, i) => pad(stripAnsi(cell), widths[i] ?? 0, alignments[i] ?? 'left'))
        .join(palette.dim(' │ ')));
    // Thin separator.
    const separator = palette.dim(widths.map(width => '─'.repeat(Math.max(3, width))).join('─┼─'));
    // Data rows: pipe-separated, clean.
    const dataLines = rows.flatMap(row => {
        const cellLines = row.map((cell, i) => wrapCell(cell, i));
        const height = Math.max(...cellLines.map(lines => lines.length), 1);
        const lines = [];
        for (let line = 0; line < height; line += 1) {
            const segments = cellLines.map((cls, i) => pad(cls[line] ?? '', widths[i] ?? 0, alignments[i] ?? 'left'));
            lines.push(segments.join(palette.dim(' │ ')));
        }
        return lines;
    });
    return [headerLine, separator, ...dataLines].join('\n');
}
/** Render any sequence of block tokens. */
function renderTokens(tokens, maxWidth) {
    // 0.9.7 紧凑化：连续代码块合并渲染——单一角标 `▌ bash ×3`，命令行紧凑
    // 排布（块间零空行）。模型常把 N 条命令拆成 N 个围栏，逐块空行+角标把
    // 13 条命令拉成一屏多，用户实测过松。
    const parts = [];
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        if (token.type === 'code') {
            const run = [];
            let j = i;
            // 连续代码块之间夹的空白 token（空行）不切断合并——marked 会把
            // 围栏间的空行产成 type:'space'。
            while (j < tokens.length) {
                const tok = tokens[j];
                if (tok.type === 'space') {
                    j += 1;
                    continue;
                }
                if (tok.type !== 'code')
                    break;
                const code = tok;
                run.push({ lang: (code.lang ?? '').trim(), text: code.text ?? '' });
                j += 1;
            }
            if (run.length > 1) {
                parts.push(renderCodeRun(run, maxWidth));
                i = j;
                continue;
            }
        }
        parts.push(renderBlock(token, maxWidth));
        i += 1;
    }
    // 0.9.8：标题块与后续代码块之间不留空行（工程清单场景：## 节 → 命令
    // 紧贴，全屏框选复制时中间无空行）。其余块间保持单空行。
    // space token 渲染成空 part——剔除（否则在标题与命令间顶出一个空行）。
    const cleanParts = parts.filter(part => part.trim() !== '');
    parts.length = 0;
    parts.push(...cleanParts);
    let out = '';
    for (let k = 0; k < parts.length; k += 1) {
        const cur = parts[k];
        // 向前越过 space token 找真正的上一个块（marked 会在块间产 space）
        void tokens;
        const prev = parts[k - 1] ?? '';
        const prevIsHeading = /^#{1,6} /u.test(stripAnsi(prev).split('\n')[0] ?? '');
        const curIsCode = true;
        if (k > 0 && prevIsHeading && curIsCode) {
            out += '\n' + cur;
        }
        else {
            out += (out === '' ? '' : '\n\n') + cur;
        }
    }
    return out;
}
/** 渲染连续多个代码块为一个紧凑单元：单一角标 + 逐行命令。 */
function renderCodeRun(run, maxWidth) {
    const lang0 = run[0].lang;
    const sameLang = run.every(r => r.lang === lang0);
    const lines = [];
    for (const block of run) {
        for (const line of block.text.split('\n'))
            lines.push(line);
    }
    void sameLang;
    void lang0;
    // 0.9.8：合并块走同一条零装饰管线（renderCode 已无角标/缩进）。
    return renderCode({ type: 'code', raw: '', lang: lang0, text: lines.join('\n') }, maxWidth);
}
/** Render a single block token. */
function renderBlock(token, maxWidth) {
    switch (token.type) {
        case 'heading':
            return renderHeading(token);
        case 'paragraph':
            return renderInline(token.tokens ?? []);
        case 'code':
            return renderCode(token, maxWidth);
        case 'blockquote':
            return renderBlockquote(token);
        case 'table':
            return renderTable(token, maxWidth);
        case 'list':
            return renderList(token);
        case 'hr':
            return palette.dim('─'.repeat(Math.min(MAX_WIDTH, renderWidth())));
        case 'space':
            return '';
        default:
            return renderInline([token]);
    }
}
/**
 * Render a markdown source string to an ANSI-colored, word-wrapped text block.
 * The result is a single string with embedded `\n` separators — ready for an
 * Ink `<Text>` element to render verbatim.
 * @param source - markdown text from the model.
 * @returns ANSI-formatted terminal text.
 */
export function renderMarkdown(source) {
    if (source === '')
        return '';
    const tokens = marked.lexer(source);
    const width = renderWidth();
    const rendered = renderTokens(tokens, width);
    return wrapAnsi(rendered, width).join('\n');
}
/** Render the markdown source trimmed of any surrounding whitespace. */
export function renderInline_(source) {
    if (source === '')
        return '';
    return renderInline(marked.lexer(source).flatMap(t => t.type === 'paragraph' ? t.tokens ?? [] : [t]));
}
//# sourceMappingURL=render.js.map