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
    /** P4: 展开工具完整输出（Ctrl+O 全局切换）。 */
    readonly expandTools?: boolean;
    message: MessageRecord;
}
/** Render one message — the unit of transcript rendering. */
export declare function Message({ message, expandTools }: MessageProps): JSX.Element;
