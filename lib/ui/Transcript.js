import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Transcript — the scrollable log of past messages. Uses Ink's `Static`
 * component so messages stay rendered once written; the in-flight streaming
 * message lives outside Static so it can be mutated cheaply.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Transcript
 */
import { Static, Box, Text } from 'ink';
import { Message } from './Message.js';
/**
 * Render the transcript. Static optimizes finished messages so re-renders on
 * streaming updates stay cheap. The current live message stays outside Static
 * by appending to the array only after the message completes.
 */
export function Transcript({ messages }) {
    // Stable partition: anything with `streaming: false` is finished.
    const lastStreaming = findLastIndex(messages, m => m.streaming);
    const finished = lastStreaming >= 0
        ? messages.slice(0, lastStreaming)
        : messages;
    const live = lastStreaming >= 0
        ? messages.slice(lastStreaming)
        : [];
    return (_jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [_jsx(Static, { items: finished.map((m, i) => ({ ...m, key: `${m.id}-${i}` })), children: (message) => (_jsx(Box, { flexDirection: "column", children: _jsx(Message, { message: message }) }, message.id)) }), live.map((message) => (_jsx(Box, { flexDirection: "column", children: _jsx(Message, { message: message }) }, `live-${message.id}`))), messages.length === 0 ? (_jsx(Box, { marginTop: 2, children: _jsx(Text, { dimColor: true, children: "(empty \u2014 type a message and press Enter to start)" }) })) : null] }));
}
function findLastIndex(items, predicate) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
        const item = items[i];
        if (item !== undefined && predicate(item))
            return i;
    }
    return -1;
}
//# sourceMappingURL=Transcript.js.map