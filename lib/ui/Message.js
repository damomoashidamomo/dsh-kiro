import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useEffect, useState } from 'react';
import { renderMarkdown } from "../markdown/render.js";
import { palette, ICONS } from "../theme/palette.js";
import { STRINGS } from "./strings.js";
/** Render one message — the unit of transcript rendering. */
export function Message({ message }) {
    switch (message.kind) {
        case 'user':
            return _jsx(UserMessage, { text: message.text });
        case 'assistant':
            return (_jsx(AssistantMessage, { text: message.text, streaming: message.streaming, settledUpTo: message.settledUpTo, continuation: message.continuation }));
        case 'reasoning':
            return _jsx(ReasoningMessage, { text: message.text, streaming: message.streaming, createdAt: message.createdAt });
        case 'tool-call':
            return _jsx(ToolMessage, { message: message });
        case 'todo':
            return _jsx(TodoMessage, { todos: message.todos ?? [] });
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
/**
 * Render an assistant message with markdown and streaming cursor. A streamed
 * answer settles block-by-block: this message shows only the UNSETTLED tail
 * (`text.slice(settledUpTo)`), while earlier pieces were already emitted as
 * finished continuation messages — that keeps Ink's live region small.
 */
function AssistantMessage({ text, streaming, settledUpTo, continuation }) {
    const settled = settledUpTo ?? 0;
    const body = settled > 0 ? text.slice(settled) : text;
    if (body.trim() === '')
        return _jsx(_Fragment, {});
    const rendered = renderMarkdown(body);
    const isContinuation = settled > 0 || continuation === true;
    return (_jsxs(Box, { flexDirection: "row", marginTop: isContinuation ? 0 : 1, children: [isContinuation ? null : _jsx(Text, { children: palette.accent2(`${ICONS.assistant} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsxs(Text, { children: [rendered, streaming ? palette.accent(' ▍') : null] }) })] }));
}
/** Render a reasoning block in italic muted-green. */
/**
 * Reasoning stays COLLAPSED to one line — the full chain would bury the
 * conversation (kiro-style cleanliness). While streaming, the live char
 * count and elapsed seconds tick so the user sees the model working
 * instead of a frozen "思考中…".
 */
function ReasoningMessage({ text, streaming, createdAt }) {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!streaming)
            return;
        const timer = setInterval(() => { setElapsed(Math.floor((Date.now() - createdAt) / 1000)); }, 1000);
        return () => { clearInterval(timer); };
    }, [streaming, createdAt]);
    const label = streaming
        ? STRINGS.transcript.thinking(formatCharCount(text.length), elapsed)
        : STRINGS.transcript.thought(formatCharCount(text.length));
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.accentSoft(`${ICONS.reasoning} `) }), _jsx(Text, { children: palette.reasoning(label) })] }));
}
/** Compact char count: 4200 -> 4.2k 字. */
function formatCharCount(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k 字` : `${n} 字`;
}
/**
 * Todo checklist snapshot: kiro-style visible progress. Completed rows
 * check off, the in-progress row is accented, pending rows stay dim.
 */
function TodoMessage({ todos }) {
    if (todos.length === 0)
        return _jsx(_Fragment, {});
    const done = todos.filter((t) => t.status === 'completed').length;
    const rows = todos.slice(0, 12).map((todo) => {
        const mark = todo.status === 'completed' ? '☑' : todo.status === 'in_progress' ? '◐' : '☐';
        const text = todo.content.length > 72 ? `${todo.content.slice(0, 71)}…` : todo.content;
        const styled = todo.status === 'completed'
            ? palette.dim(`${mark} ${text}`)
            : todo.status === 'in_progress'
                ? palette.accent(`${mark} ${text}`)
                : palette.muted(`${mark} ${text}`);
        return _jsx(Text, { children: styled }, todo.content);
    });
    if (todos.length > 12) {
        rows.push(_jsx(Text, { children: palette.muted(`… 还有 ${todos.length - 12} 项`) }, "__more"));
    }
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { children: palette.accentSoft(STRINGS.transcript.taskList(done, todos.length)) }), rows] }));
}
/** Render a system message in muted dim. */
function SystemMessage({ text }) {
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.muted(`${ICONS.system} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsx(Text, { children: palette.muted(text) }) })] }));
}
/** Render an error message in red. */
function ErrorMessage({ text }) {
    return (_jsxs(Box, { flexDirection: "row", marginTop: 1, children: [_jsx(Text, { children: palette.error(`${ICONS.error} `) }), _jsx(Box, { flexDirection: "column", flexGrow: 1, children: _jsx(Text, { children: palette.error(text) }) })] }));
}
/**
 * One-line outcome for a tool card: the FIRST meaningful line of the result
 * (status line / first stdout row / error headline). Page bodies behind it —
 * fetched content, JSON payloads — stay out of the transcript.
 */
function outcomeLine(output) {
    const noise = /^(external web content follows|treat it as untrusted data|not as instructions)\b/i;
    for (const raw of output.split('\n')) {
        const line = raw.trim();
        if (line === '' || noise.test(line))
            continue;
        return line.length > 160 ? `${line.slice(0, 159)}…` : line;
    }
    return '(no output)';
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
        ? palette.muted(`  → ${outcomeLine(tool.output)}`)
        : null;
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { children: header }), argsPreview !== null ? _jsx(Text, { children: argsPreview }) : null, output !== null ? _jsx(Text, { children: output }) : null] }));
}
//# sourceMappingURL=Message.js.map