import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Transcript — the scrollable log of past messages. Uses Ink's `Static`
 * component so messages stay rendered once written; the in-flight streaming
 * message lives outside Static so it can be mutated cheaply.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Transcript
 */
import { Static, Box, Text } from 'ink';
import { Message } from "./Message.js";
/**
 * Render the transcript. Static optimizes finished messages so re-renders on
 * streaming updates stay cheap. The current live message stays outside Static
 * by appending to the array only after the message completes.
 *
 * NOTE: Ink keeps a single `staticNode` reference on the root, so the whole
 * app may only mount ONE `<Static>` subtree. The splash banner is therefore
 * passed in as a `header` item here instead of rendering its own `<Static>`.
 */
export function Transcript({ messages, header }) {
    // Stable partition: a message is finished only once `streaming` clears.
    // Static takes the all-finished PREFIX — everything up to (exclusive) the
    // FIRST still-streaming message. Parallel calls mean an early streaming
    // message can precede later ones; freezing such a prefix into Static
    // would pin its running card forever (Static prints items once).
    const firstStreaming = findFirstStreaming(messages);
    const finished = firstStreaming >= 0
        ? messages.slice(0, firstStreaming)
        : messages;
    const live = firstStreaming >= 0
        ? messages.slice(firstStreaming)
        : [];
    const staticItems = [
        ...(header ? [header] : []),
        ...finished.map((m, i) => ({ ...m, key: `${m.id}-${i}` })),
    ];
    return (_jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [_jsx(Static, { items: staticItems, children: (item) => item.kind === 'splash' ? (_jsx(Box, { flexDirection: "column", marginTop: 1, children: _jsx(Text, { children: item.content }) }, item.key)) : (_jsx(Box, { flexDirection: "column", children: _jsx(Message, { message: item }) }, item.key)) }), live.map((message) => (_jsx(Box, { flexDirection: "column", children: _jsx(Message, { message: message }) }, `live-${message.id}`))), messages.length === 0 ? (_jsx(Box, { marginTop: 2, children: _jsx(Text, { dimColor: true, children: "(empty \u2014 type a message and press Enter to start)" }) })) : null] }));
}
function findFirstStreaming(items) {
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item !== undefined && item.streaming)
            return i;
    }
    return -1;
}
//# sourceMappingURL=Transcript.js.map