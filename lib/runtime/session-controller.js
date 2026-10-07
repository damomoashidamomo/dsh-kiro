/**
 * dsh-kiro SessionController — bridges DSH's `session/event` bus to a
 * render-friendly state object the Ink UI subscribes to. Owns no UI; it
 * builds the model and lets the renderer decide how to draw.
 *
 * The controller subscribes to one session at a time — the agent's current
 * session — so swapping sessions (via /chat resume, /chat new) re-binds the
 * listener without losing the previous transcript.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/session-controller
 */
/** Initial empty render state. */
function emptyState() {
    return {
        sessionId: undefined,
        messages: [],
        agent: {
            status: 'idle',
            activeAgent: undefined,
            activeModel: undefined,
            activeProvider: undefined,
            lastTurnReason: undefined,
            contextUsedTokens: 0,
            contextLimitTokens: undefined,
        },
        overlay: { kind: 'none' },
        picker: undefined,
        approval: undefined,
        question: undefined,
        hasActiveTool: false,
    };
}
/** Convert a session seq into a unique renderable id. */
function idFor(kind, seq) {
    return `${kind}-${seq}`;
}
/** Truncate a status-bar reason label to a single readable line. */
function truncateLabel(text, max = 48) {
    const single = text.replace(/\s+/g, ' ').trim();
    return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}
/**
 * Find the LAST tool-call message whose record pairs with `callId`
 * (findLastIndex is not in this tsconfig's lib target).
 */
function findToolCallIndex(messages, callId) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message?.kind === 'tool-call' && message.tool?.callId === callId)
            return i;
    }
    return -1;
}
/** Render-friendly preview of an arbitrary JSON value. */
function previewValue(value) {
    if (value === undefined)
        return '';
    if (typeof value === 'string')
        return value;
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
/** Truncate a preview to a UI-friendly size. */
function truncate(text, max = 120) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max - 1)}…`;
}
/** Coerce a content-block array to plain text. */
function contentToText(content) {
    return content
        .map(block => {
        if (typeof block === 'object' && block !== null && 'type' in block) {
            const b = block;
            if (b.type === 'text' && typeof b.text === 'string')
                return b.text;
            // Tool-result blocks keep their payload nested one level down.
            if (b.type === 'tool-result' && Array.isArray(b.content))
                return contentToText(b.content);
        }
        return '';
    })
        .join('');
}
/**
 * The controller that projects session events onto UI state. One instance per
 * runtime plugin; the controller does not own the agent — it follows whatever
 * agent the runtime plugin creates.
 */
export class SessionController {
    state = emptyState();
    listeners = new Set();
    agent;
    unsubscribe;
    /** In-flight tool calls keyed by platform callId (parallel-safe). */
    activeTools = new Map();
    /** Subscribe to state changes. Returns the disposer. */
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.state);
        return () => {
            this.listeners.delete(listener);
        };
    }
    /** Snapshot of the current state. */
    getState() {
        return this.state;
    }
    /** Wipe the visible transcript without touching the durable session log. */
    clearTranscript() {
        this.state = { ...this.state, messages: [] };
        this.publish();
    }
    /** Replace the controlled agent and rebind session events. */
    bindAgent(ctx, agent) {
        if (this.agent === agent)
            return;
        this.unsubscribe?.();
        this.agent = agent;
        this.state = { ...emptyState(), sessionId: String(agent.session.id) };
        this.publish();
        this.unsubscribe = ctx.on('session/event', (session, event) => {
            if (session !== agent.session)
                return;
            this.applyEvent(event);
        });
    }
    /** Detach the controlled agent. */
    unbind() {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.agent = undefined;
        this.activeTools.clear();
        this.state = emptyState();
        this.publish();
    }
    /** Push a UI overlay state change. */
    setOverlay(overlay) {
        if (this.state.overlay === overlay)
            return;
        this.state = { ...this.state, overlay };
        this.publish();
    }
    /** Append a system message to the transcript (for slash command feedback). */
    pushSystem(text) {
        const seq = this.state.messages.length;
        const message = {
            id: idFor('system', seq),
            kind: 'system',
            text,
            tool: undefined,
            createdAt: Date.now(),
            seq,
            usage: undefined,
            streaming: false,
        };
        this.state = { ...this.state, messages: [...this.state.messages, message] };
        this.publish();
    }
    // --- Interactive picker (kiro-style list chooser) ---
    /** Selection callback stored out-of-band (never part of the render state). */
    pickerOnSelect;
    /**
     * Open an interactive picker. The command handler builds the items and
     * supplies an `onSelect` closure (it owns the apply logic — persist,
     * patch, push feedback); the controller only manages selection state.
     */
    openPicker(request) {
        if (request.items.length === 0)
            return;
        // Open with the current choice highlighted, kiro-style.
        const currentIndex = request.items.findIndex((item) => item.current === true);
        this.pickerOnSelect = request.onSelect;
        this.state = {
            ...this.state,
            picker: {
                title: request.title,
                items: request.items,
                selected: currentIndex >= 0 ? currentIndex : 0,
            },
        };
        this.publish();
    }
    /** Close the picker without selecting. */
    closePicker() {
        this.pickerOnSelect = undefined;
        if (this.state.picker === undefined)
            return;
        this.state = { ...this.state, picker: undefined };
        this.publish();
    }
    /** Move the highlighted row by `delta`, clamped to the list. */
    movePickerSelection(delta) {
        const picker = this.state.picker;
        if (picker === undefined || picker.items.length === 0)
            return;
        this.setPickerSelection(picker.selected + delta);
    }
    /** Jump the highlight to an absolute index (used by filtered picker views). */
    setPickerSelection(index) {
        const picker = this.state.picker;
        if (picker === undefined || picker.items.length === 0)
            return;
        const selected = Math.max(0, Math.min(picker.items.length - 1, index));
        if (selected === picker.selected)
            return;
        this.state = { ...this.state, picker: { ...picker, selected } };
        this.publish();
    }
    /** Confirm the highlighted row: runs the opener's callback, then closes. */
    selectPickerItem() {
        const picker = this.state.picker;
        const callback = this.pickerOnSelect;
        if (picker === undefined || callback === undefined)
            return;
        const item = picker.items[picker.selected];
        this.pickerOnSelect = undefined;
        this.state = { ...this.state, picker: undefined };
        this.publish();
        if (item !== undefined)
            callback(item);
    }
    // --- Tool-permission approval (kiro-style ask panel) ---
    /** Resolver for the currently pending approval question, if any. */
    approvalResolve;
    /** Approval signal cleanup for the currently pending question. */
    approvalSignalCleanup;
    /** Tools the user allowed for the rest of this session (per-boot memory). */
    sessionAllowedTools = new Set();
    // --- Structured questions (plan review, generic asks) ---
    /** Resolver for the currently pending question, if any. */
    questionResolve;
    /** Question signal cleanup for the currently pending question. */
    questionSignalCleanup;
    /**
     * Put a permission question to the user. Resolves when the UI answers,
     * or with `{ kind: 'cancelled' }` when the request signal aborts (turn
     * cancelled) or the turn closes — the approval service discards late
     * answers itself, so cancelling here only needs to close the panel.
     */
    openApproval(request, signal) {
        this.cancelApproval();
        const promise = new Promise((resolve) => {
            this.approvalResolve = resolve;
        });
        if (signal !== undefined) {
            if (signal.aborted) {
                this.approvalResolve = undefined;
                return Promise.resolve({ kind: 'cancelled' });
            }
            if (typeof signal.addEventListener === 'function') {
                const onAbort = () => { this.cancelApproval(); };
                signal.addEventListener('abort', onAbort);
                this.approvalSignalCleanup = () => {
                    signal.removeEventListener?.('abort', onAbort);
                };
            }
        }
        this.state = { ...this.state, approval: request };
        this.publish();
        return promise;
    }
    /** Answer the pending question (UI path) and close the panel. */
    resolveApproval(choice) {
        const resolve = this.approvalResolve;
        this.approvalSignalCleanup?.();
        this.approvalSignalCleanup = undefined;
        this.approvalResolve = undefined;
        if (this.state.approval !== undefined) {
            this.state = { ...this.state, approval: undefined };
            this.publish();
        }
        resolve?.(choice);
    }
    /** Withdraw the question without a user answer (signal/turn end). */
    cancelApproval() {
        const resolve = this.approvalResolve;
        this.approvalSignalCleanup?.();
        this.approvalSignalCleanup = undefined;
        this.approvalResolve = undefined;
        if (this.state.approval !== undefined) {
            this.state = { ...this.state, approval: undefined };
            this.publish();
        }
        resolve?.({ kind: 'cancelled' });
    }
    /** Whether the user allowed this tool for the whole session. */
    isToolAllowedForSession(toolName) {
        return this.sessionAllowedTools.has(toolName);
    }
    /** Remember a session-wide allowance for this tool (本会话始终允许). */
    allowToolForSession(toolName) {
        this.sessionAllowedTools.add(toolName);
    }
    /**
     * Put a structured question to the user (plan review, generic ask).
     * Resolves when the UI answers, or with `{ kind: 'dismissed' }` when the
     * request signal aborts or the turn closes — the caller maps a dismissal
     * to ASK_CANCELLED semantics (stay and wait for the user's own words).
     */
    openQuestion(request, signal) {
        this.cancelQuestion();
        const promise = new Promise((resolve) => {
            this.questionResolve = resolve;
        });
        if (signal !== undefined) {
            if (signal.aborted) {
                this.questionResolve = undefined;
                return Promise.resolve({ kind: 'dismissed' });
            }
            if (typeof signal.addEventListener === 'function') {
                const onAbort = () => { this.cancelQuestion(); };
                signal.addEventListener('abort', onAbort);
                this.questionSignalCleanup = () => {
                    signal.removeEventListener?.('abort', onAbort);
                };
            }
        }
        this.state = { ...this.state, question: request };
        this.publish();
        return promise;
    }
    /** Answer the pending question (UI path) and close the panel. */
    resolveQuestion(choice) {
        const resolve = this.questionResolve;
        this.questionSignalCleanup?.();
        this.questionSignalCleanup = undefined;
        this.questionResolve = undefined;
        if (this.state.question !== undefined) {
            this.state = { ...this.state, question: undefined };
            this.publish();
        }
        resolve?.(choice);
    }
    /** Withdraw the question without a user answer (signal/turn end). */
    cancelQuestion() {
        const resolve = this.questionResolve;
        this.questionSignalCleanup?.();
        this.questionSignalCleanup = undefined;
        this.questionResolve = undefined;
        if (this.state.question !== undefined) {
            this.state = { ...this.state, question: undefined };
            this.publish();
        }
        resolve?.({ kind: 'dismissed' });
    }
    /** Patch the agent snapshot (used by status bar updates outside the event bus). */
    patchAgent(snapshot) {
        this.state = {
            ...this.state,
            agent: { ...this.state.agent, ...snapshot },
        };
        this.publish();
    }
    /** Notify subscribers of a state change. */
    publish() {
        const snapshot = this.state;
        for (const listener of this.listeners)
            listener(snapshot);
    }
    /** Apply one session event. */
    applyEvent(event) {
        switch (event.type) {
            case 'turn/start': {
                this.state = {
                    ...this.state,
                    agent: { ...this.state.agent, status: 'running' },
                };
                this.publish();
                return;
            }
            case 'turn/end': {
                const reason = event.data.reason;
                // A closed turn withdraws any pending approval question or structured
                // question (both are turn-enclosed by design); late answers are
                // discarded upstream.
                this.cancelApproval();
                this.cancelQuestion();
                // Surface the real failure instead of a bare "error" chip: LlmFailure
                // carries the driver message (e.g. missing API key, bad model id).
                let label = reason.kind;
                if (reason.kind === 'error') {
                    const message = typeof reason.error?.message === 'string' ? reason.error.message : 'unknown error';
                    label = `error: ${truncateLabel(message)}`;
                    this.pushSystem(`✗ 回合失败：${message}`);
                }
                this.state = {
                    ...this.state,
                    agent: {
                        ...this.state.agent,
                        status: reason.kind === 'completed' ? 'idle' : 'error',
                        lastTurnReason: label,
                    },
                    hasActiveTool: false,
                };
                this.activeTools.clear();
                this.sweepOrphanedToolCalls();
                this.publish();
                return;
            }
            case 'assistant/message': {
                const data = event.data;
                const text = contentToText(data.message.content);
                const seq = Number(event.seq);
                const message = {
                    id: idFor('assistant', seq),
                    kind: 'assistant',
                    text,
                    tool: undefined,
                    createdAt: Date.now(),
                    seq,
                    usage: undefined,
                    streaming: false,
                };
                this.state = { ...this.state, messages: [...this.state.messages, message] };
                this.publish();
                return;
            }
            case 'assistant/chunk': {
                const chunk = event.data.chunk;
                if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
                    this.appendToLastAssistant(chunk.text);
                    return;
                }
                if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
                    this.appendReasoning(chunk.text);
                    return;
                }
                if (chunk.type === 'usage' && chunk.usage !== undefined) {
                    this.recordUsage(chunk.usage);
                    return;
                }
                return;
            }
            case 'tool/call': {
                const data = event.data;
                const seq = Number(event.seq);
                const record = {
                    id: idFor('tool-call', seq),
                    callId: data.callId,
                    name: data.name,
                    argsPreview: truncate(previewValue(data.arguments), 240),
                    state: 'running',
                    output: '',
                    outputSpillPath: undefined,
                    durationMs: undefined,
                    metadata: {},
                };
                this.activeTools.set(data.callId, record);
                const message = {
                    id: idFor('tool-call', seq),
                    kind: 'tool-call',
                    text: '',
                    tool: record,
                    createdAt: Date.now(),
                    seq,
                    usage: undefined,
                    streaming: true,
                };
                this.state = {
                    ...this.state,
                    hasActiveTool: this.activeTools.size > 0,
                    messages: [...this.state.messages, message],
                };
                this.publish();
                return;
            }
            case 'tool/result': {
                const data = event.data;
                const text = contentToText(data.message.content);
                // Correlate by the platform's callId (result content[0].toolCallId)
                // rather than positional trust: parallel calls and interleaved
                // assistant text mean the matching call is not necessarily last.
                const callId = data.message.content.find((block) => typeof block?.toolCallId === 'string')?.toolCallId;
                const finished = callId !== undefined ? this.activeTools.get(callId) : undefined;
                if (finished !== undefined && callId !== undefined) {
                    this.activeTools.delete(callId);
                    finished.state = data.error !== undefined ? 'failed' : 'done';
                    finished.output = truncate(text, 800);
                    const index = findToolCallIndex(this.state.messages, callId);
                    const target = index >= 0 ? this.state.messages[index] : undefined;
                    finished.durationMs = Date.now() - (target?.createdAt ?? Date.now());
                    if (target !== undefined) {
                        const updated = { ...target, tool: { ...finished }, streaming: false };
                        const messages = [...this.state.messages];
                        messages[index] = updated;
                        this.state = {
                            ...this.state,
                            hasActiveTool: this.activeTools.size > 0,
                            messages,
                        };
                    }
                    else {
                        this.state = { ...this.state, hasActiveTool: this.activeTools.size > 0 };
                    }
                    this.publish();
                }
                return;
            }
            default:
                return;
        }
    }
    /**
     * Close any tool-call message still marked streaming (a result that never
     * correlated, or a turn cancelled mid-call). A stuck `streaming` flag
     * pins every later message into Ink's live region, so the whole UI
     * re-renders each spinner tick — this sweep is the backstop.
     */
    sweepOrphanedToolCalls() {
        let changed = false;
        const messages = this.state.messages.map((message) => {
            if (message.kind === 'tool-call' && message.streaming && message.tool !== undefined) {
                changed = true;
                return {
                    ...message,
                    streaming: false,
                    tool: { ...message.tool, state: 'failed', output: message.tool.output === '' ? '(no result — turn ended)' : message.tool.output },
                };
            }
            return message;
        });
        if (changed) {
            this.state = { ...this.state, messages };
        }
    }
    /** Append to the last assistant message, creating it if absent. */
    appendToLastAssistant(delta) {
        if (delta === '')
            return;
        const messages = [...this.state.messages];
        const last = messages.at(-1);
        if (last?.kind === 'assistant') {
            messages[messages.length - 1] = { ...last, text: last.text + delta, streaming: true };
        }
        else {
            messages.push({
                id: idFor('assistant', messages.length),
                kind: 'assistant',
                text: delta,
                tool: undefined,
                createdAt: Date.now(),
                seq: messages.length,
                usage: undefined,
                streaming: true,
            });
        }
        this.state = { ...this.state, messages };
        this.publish();
    }
    /** Append a reasoning block to a dedicated message. */
    appendReasoning(delta) {
        if (delta === '')
            return;
        const messages = [...this.state.messages];
        const last = messages.at(-1);
        if (last?.kind === 'reasoning') {
            messages[messages.length - 1] = { ...last, text: last.text + delta, streaming: true };
        }
        else {
            messages.push({
                id: idFor('reasoning', messages.length),
                kind: 'reasoning',
                text: delta,
                tool: undefined,
                createdAt: Date.now(),
                seq: messages.length,
                usage: undefined,
                streaming: true,
            });
        }
        this.state = { ...this.state, messages };
        this.publish();
    }
    /** Record the latest token-usage sample for the StatusBar. */
    recordUsage(usage) {
        const input = usage.inputTokens ?? 0;
        const output = usage.outputTokens ?? 0;
        const total = usage.totalTokens ?? input + output;
        this.state = {
            ...this.state,
            agent: { ...this.state.agent, contextUsedTokens: total },
        };
        const messages = [...this.state.messages];
        const last = messages.at(-1);
        if (last?.kind === 'assistant') {
            messages[messages.length - 1] = { ...last, usage: { input, output } };
            this.state = { ...this.state, messages };
        }
        this.publish();
    }
}
//# sourceMappingURL=session-controller.js.map