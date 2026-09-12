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
import { Box, Text } from 'ink';
import { renderMarkdown } from "../markdown/render.js";
import { palette, ICONS } from "../theme/palette.js";
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
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.accent(`${ICONS.user} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsx(Text, { children: text }) })] }));
}
/** Render an assistant message with markdown and streaming cursor. */
function AssistantMessage({ text, streaming }) {
    const rendered = renderMarkdown(text);
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.accent2(`${ICONS.assistant} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsxs(Text, { children: [rendered, streaming ? palette.accent(' ▍') : null] }) })] }));
}
/** Render a reasoning block in italic muted-green. */
function ReasoningMessage({ text }) {
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.accentSoft(`${ICONS.reasoning} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsx(Text, { children: palette.reasoning(text) }) })] }));
}
/** Render a system message in muted dim. */
function SystemMessage({ text }) {
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.muted(`${ICONS.system} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsx(Text, { children: palette.muted(text) }) })] }));
}
/** Render an error message in red. */
function ErrorMessage({ text }) {
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.error(`${ICONS.error} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsx(Text, { children: palette.error(text) }) })] }));
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
        : null;
    const output = tool.output.length > 0
        ? palette.muted(`  → ${tool.output}`)
        : null;
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { children: header }), argsPreview !== null ? _jsx(Text, { children: argsPreview }) : null, output !== null ? _jsx(Text, { children: output }) : null] }));
}
//# sourceMappingURL=Message.js.map