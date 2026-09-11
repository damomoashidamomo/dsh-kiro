import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @deepseek-ai/ui-primitives/markdown render — minimal but faithful GFM subset
 * for the dsh-kiro TUI. Renders to ANSI strings the Ink renderer consumes.
 *
 * Mirrors the Web markdown layer's vocabulary (mdast) on a stripped surface:
 * inline emphasis, strong, code, links, line breaks, headings (h1–h6),
 * fenced code blocks with syntax highlighting, block quotes, ordered and
 * unordered lists, GFM tables (box-drawing), and horizontal rules.
 */
import { renderMarkdown } from '../markdown/render.js';
import { palette, ICONS } from '../theme/palette.js';
/** Render one message — the unit of transcript rendering. */
export function Message({ message }) {
    switch (message.kind) {
        case 'user':
            return _jsx(UserMessage, { text: message.text });
        case 'assistant':
            return _jsx(AssistantMessage, { text: message.text, streaming: message.streaming });
        case 'reasoning':
            return _jsx(ReasoningMessage, { text: message.text });
        case 'tool-call':
            return _jsx(ToolMessage, { message: message });
        case 'system':
            return _jsx(SystemMessage, { text: message.text });
        case 'error':
            return _jsx(ErrorMessage, { text: message.text });
        default:
            return _jsx(SystemMessage, { text: "(unknown message kind)" });
    }
}
/** Render a user prompt with the `›` gutter. */
function UserMessage({ text }) {
    return (_jsxs("box", { flexDirection: "row", marginTop: 1, children: [_jsx("text", { children: palette.accent(`${ICONS.user} `) }), _jsx("box", { flexDirection: "column", flexGrow: 1, children: _jsx("text", { children: text }) })] }));
}
/** Render an assistant message with markdown and streaming cursor. */
function AssistantMessage({ text, streaming }) {
    const rendered = renderMarkdown(text);
    const cursor = streaming ? palette.accent(' ▍') : '';
    return (_jsxs("box", { flexDirection: "row", marginTop: 1, children: [_jsx("text", { children: palette.accent2(`${ICONS.assistant} `) }), _jsx("box", { flexDirection: "column", flexGrow: 1, children: _jsxs("text", { children: [rendered, cursor] }) })] }));
}
/** Render a reasoning block in italic muted-green. */
function ReasoningMessage({ text }) {
    return (_jsxs("box", { flexDirection: "row", marginTop: 1, children: [_jsx("text", { children: palette.accentSoft(`${ICONS.reasoning} `) }), _jsx("box", { flexDirection: "column", flexGrow: 1, children: _jsx("text", { children: palette.reasoning(text) }) })] }));
}
/** Render a system message in muted dim. */
function SystemMessage({ text }) {
    return (_jsxs("box", { flexDirection: "row", marginTop: 1, children: [_jsx("text", { children: palette.muted(`${ICONS.system} `) }), _jsx("box", { flexDirection: "column", flexGrow: 1, children: _jsx("text", { children: palette.muted(text) }) })] }));
}
/** Render an error message in red. */
function ErrorMessage({ text }) {
    return (_jsxs("box", { flexDirection: "row", marginTop: 1, children: [_jsx("text", { children: palette.error(`${ICONS.error} `) }), _jsx("box", { flexDirection: "column", flexGrow: 1, children: _jsx("text", { children: palette.error(text) }) })] }));
}
/** Render a tool call + (eventually) result. */
function ToolMessage({ message }) {
    const tool = message.tool;
    if (tool === undefined) {
        return _jsx(SystemMessage, { text: "(orphan tool event)" });
    }
    const stateLabel = {
        pending: palette.muted('pending'),
        running: palette.warning(`running ${palette.muted('...')}`),
        done: palette.success('done'),
        failed: palette.error('failed'),
        cancelled: palette.muted('cancelled'),
    };
    const icon = tool.state === 'done'
        ? ICONS.toolDone
        : tool.state === 'failed'
            ? ICONS.toolFailed
            : ICONS.tool;
    const iconColor = tool.state === 'done'
        ? palette.success
        : tool.state === 'failed'
            ? palette.error
            : tool.state === 'running'
                ? palette.warning
                : palette.muted;
    const header = `${iconColor(`${icon} ${tool.name}`)} ${palette.dim('·')} ${stateLabel[tool.state]}`;
    const argsPreview = tool.argsPreview.length > 0
        ? palette.dim(`  ${tool.argsPreview.split('\n').join('\n  ')}`)
        : '';
    const output = tool.output.length > 0
        ? palette.muted(`  → ${tool.output}`)
        : '';
    return (_jsxs("box", { flexDirection: "column", marginTop: 1, children: [_jsx("text", { children: header }), argsPreview !== '' ? _jsx("text", { children: argsPreview }) : null, output !== '' ? _jsx("text", { children: output }) : null] }));
}
//# sourceMappingURL=Message.js.map