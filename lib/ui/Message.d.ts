/**
 * @deepseek-ai/ui-primitives/markdown render — minimal but faithful GFM subset
 * for the dsh-kiro TUI. Renders to ANSI strings the Ink renderer consumes.
 *
 * Mirrors the Web markdown layer's vocabulary (mdast) on a stripped surface:
 * inline emphasis, strong, code, links, line breaks, headings (h1–h6),
 * fenced code blocks with syntax highlighting, block quotes, ordered and
 * unordered lists, GFM tables (box-drawing), and horizontal rules.
 */
import type { Message as MessageRecord } from '../runtime/types';
export interface MessageProps {
    message: MessageRecord;
}
/** Render one message — the unit of transcript rendering. */
export declare function Message({ message }: MessageProps): JSX.Element;
