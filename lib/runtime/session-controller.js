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
import { classifyTurnFailure } from "./turn-failure.js";
import { loadProjectApprovals, loadProjectPatterns, saveProjectApprovals, commandTextOf, } from "./trust-store.js";
import { settleCut, settlePieceText, wallCut } from "./streaming-settle.js";
import { findToolCallIndex, previewValue, truncate, truncateLabel, contentToText, } from "./event-helpers.js";
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
            planMode: false,
            permissionPreset: undefined,
            lastTtftMs: undefined,
            workspace: undefined,
        },
        todos: undefined,
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
/**
 * Rows of streaming tail kept OUTSIDE `<Static>`: the renderer repaints only
 * changed lines now, but a tail taller than the screen still cannot flow into
 * the terminal scrollback while it is live, so the wall-of-text guard settles
 * it in paragraphs of about this height.
 */
function liveTailRows() {
    const rows = process.stdout.rows ?? 24;
    return Math.max(4, Math.min(12, Math.floor(rows / 3)));
}
/**
 * The controller that projects session events onto UI state. One instance per
 * runtime plugin; the controller does not own the agent — it follows whatever
 * agent the runtime plugin creates.
 */
export class SessionController {
    stateValue = emptyState();
    /** Current render snapshot (read-only view for services like /retry). */
    get state() {
        return this.stateValue;
    }
    listeners = new Set();
    /** Monotonic counter for shell-like prompt-echo messages. */
    echoSeq = 0;
    agent;
    /** App context (for platform projections such as contextPressure). */
    boundCtx;
    /** Disposer for the agent/assistant-stream live-chunk listener. */
    unsubscribeStream;
    /** Coalesced publish timer for streaming deltas (anti-flicker). */
    publishTimer;
    unsubscribe;
    /** In-flight tool calls keyed by platform callId (parallel-safe). */
    activeTools = new Map();
    /**
     * Text of the most recent steer, already echoed locally as `↪ 已插话`.
     * The platform delivers the same text as a `user/message` when the next
     * step consumes it — match and drop to avoid a duplicate row.
     */
    lastSteeredText;
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
        this.stateValue = { ...this.state, messages: [] };
        this.publish();
    }
    /**
     * Rebuild the transcript from a persisted session log (resume). Events are
     * applied through the normal projection with publishing suppressed — a
     * publish per replayed event would re-render the whole tree hundreds of
     * times — then leftovers are closed and ONE publish fires at the end.
     */
    replayEvents(events) {
        this.replaying = true;
        try {
            for (const event of events) {
                try {
                    this.applyEvent(event);
                }
                catch {
                    // A malformed or future-shape row must not break the whole replay.
                }
            }
        }
        finally {
            this.replaying = false;
        }
        this.closeStreamingAssistant();
        this.closeStreamingReasoning();
        this.sweepOrphanedToolCalls();
        // Context estimate: the token-meter projection only counts pressure
        // confirmed in THIS process, so a resumed session reads 0 until the next
        // turn. Estimate from the replayed transcript (CJK ~0.8 token/char,
        // latin ~0.25) so the gutter shows an honest 约 N% instead of 0%.
        let cjk = 0;
        let latin = 0;
        for (const m of this.state.messages) {
            for (const text of [m.text, m.tool?.argsPreview ?? '', m.tool?.output ?? '']) {
                for (const ch of text) {
                    if ((ch.codePointAt(0) ?? 0) > 0x2e80)
                        cjk += 1;
                    else
                        latin += 1;
                }
            }
        }
        const estimate = Math.round(cjk * 0.8 + latin * 0.25);
        this.stateValue = {
            ...this.state,
            agent: { ...this.state.agent, status: 'idle', contextUsedTokens: estimate, contextApprox: true },
        };
        this.publish();
    }
    /** Replace the controlled agent and rebind session events. */
    bindAgent(ctx, agent) {
        if (this.agent === agent)
            return;
        this.unsubscribe?.();
        this.boundCtx = ctx;
        this.agent = agent;
        this.stateValue = { ...emptyState(), sessionId: String(agent.session.id) };
        // Session workspace: fixed at agent creation (tools + sandbox anchor to
        // it). The header is the platform's source of truth.
        const header = agent.session.header;
        const cwd = header?.cwd ?? process.cwd();
        this.stateValue = {
            ...this.state,
            agent: { ...this.state.agent, workspace: cwd },
        };
        this.refreshPermissionPreset();
        this.publish();
        this.unsubscribe = ctx.on('session/event', (session, event) => {
            if (session !== agent.session)
                return;
            this.applyEvent(event);
        });
        // Streaming chunks arrive on the Cordis 'agent/assistant-stream' channel,
        // NOT through session/event — the agent-loop dispatches live frames here
        // before the durable assistant/message commit. Without this listener the
        // transcript only updates at step boundaries (non-streaming feel).
        const onStream = ctx.on?.bind(ctx);
        if (onStream !== undefined) {
            this.unsubscribeStream = onStream('agent/assistant-stream', ({ frame }) => {
                if (frame?.type === 'chunk' && frame.chunk !== undefined) {
                    this.applyEvent({ type: 'assistant/chunk', seq: 0, data: { chunk: frame.chunk } });
                }
            });
        }
    }
    /** Abort the active turn via the platform's kiroInterrupt service. */
    cancelActiveTurn() {
        if (this.boundCtx === undefined)
            return;
        try {
            const interrupt = this.boundCtx.get?.('kiroInterrupt');
            interrupt?.cancel?.();
        }
        catch {
            // service not mounted or agent already idle
        }
    }
    /** Detach the controlled agent. */
    unbind() {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.agent = undefined;
        this.activeTools.clear();
        this.stateValue = emptyState();
        this.publish();
    }
    /** Push a UI overlay state change. */
    setOverlay(overlay) {
        if (this.state.overlay === overlay)
            return;
        this.stateValue = { ...this.state, overlay };
        this.publish();
    }
    /** Append a system message to the transcript (for slash command feedback). */
    /** Record a steered input already echoed locally (dedupe on arrival). */
    noteSteered(text) {
        this.lastSteeredText = text;
    }
    /** Append a todo checklist snapshot, skipping no-op duplicates. */
    pushTodoSnapshot(todos) {
        const signature = todos.map((t) => `${t.status}:${t.content}`).join('|');
        const lastTodo = [...this.state.messages].reverse().find((m) => m.kind === 'todo');
        if (lastTodo?.text === signature)
            return;
        const seq = this.state.messages.length + 1;
        const message = {
            id: idFor('todo', seq),
            kind: 'todo',
            text: signature,
            todos,
            tool: undefined,
            createdAt: Date.now(),
            seq,
            usage: undefined,
            streaming: false,
        };
        this.stateValue = { ...this.state, messages: [...this.state.messages, message] };
    }
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
        this.stateValue = { ...this.state, messages: [...this.state.messages, message] };
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
        this.stateValue = {
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
        this.stateValue = { ...this.state, picker: undefined };
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
        this.stateValue = { ...this.state, picker: { ...picker, selected } };
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
        this.stateValue = { ...this.state, picker: undefined };
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
    /** Context-pressure hints fired this session (dedupe; reset under 50%). */
    contextHints = { t60: false, t80: false };
    /** Wall-clock of the open turn's start (TTFT numerator). */
    turnStartedAt;
    /** Record first-token latency once per turn (P8). */
    markFirstToken() {
        if (this.turnStartedAt === undefined)
            return;
        const ttft = Date.now() - this.turnStartedAt;
        this.turnStartedAt = undefined;
        this.stateValue = {
            ...this.state,
            agent: { ...this.state.agent, lastTtftMs: ttft },
        };
    }
    /**
     * Project-level approvals (`.kiro/approvals.json` in the workspace):
     * tools the user marked "always allow for this project" (whole-tool), and
     * command-prefix patterns for finer trust (e.g. every `grep ...` inside
     * bash). Seeded at construction and rewritten on each allow choice.
     */
    projectAllowedTools = new Set(loadProjectApprovals());
    projectPatterns = loadProjectPatterns();
    /** Session-scoped prefix patterns (chosen via 本会话 + 前缀). */
    sessionPatterns = [];
    constructor() {
        for (const tool of this.projectAllowedTools)
            this.sessionAllowedTools.add(tool);
    }
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
        this.stateValue = { ...this.state, approval: request };
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
            this.stateValue = { ...this.state, approval: undefined };
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
            this.stateValue = { ...this.state, approval: undefined };
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
    /** Remember a project-wide allowance (本项目始终允许) and persist it. */
    allowToolForProject(toolName) {
        this.sessionAllowedTools.add(toolName);
        this.projectAllowedTools.add(toolName);
        saveProjectApprovals([...this.projectAllowedTools], this.projectPatterns);
    }
    /** Persist a finer-grained project trust pattern (命令/前缀). */
    allowPatternForProject(pattern) {
        this.projectPatterns.push(pattern);
        saveProjectApprovals([...this.projectAllowedTools], this.projectPatterns);
    }
    /** Remember a session-scoped trust pattern. */
    allowPatternForSession(pattern) {
        this.sessionPatterns.push(pattern);
    }
    /**
     * Whether a pending tool request matches a stored trust pattern. `args`
     * is the full argument JSON from the tool/call event; matching compares
     * the command-relevant string (bash: `command`, others: full JSON) as a
     * prefix.
     */
    matchesTrustPattern(toolName, args) {
        const text = commandTextOf(toolName, args);
        if (text === undefined)
            return false;
        const match = (p) => p.tool === toolName && text.startsWith(p.prefix);
        return this.sessionPatterns.some(match) || this.projectPatterns.some(match);
    }
    /** Latest recorded argument payload for a tool name (or undefined). */
    latestToolArgs(toolName) {
        for (let i = this.state.messages.length - 1; i >= 0; i -= 1) {
            const message = this.state.messages[i];
            if (message?.kind === 'tool-call' && message.tool?.name === toolName) {
                return message.tool.argsRaw;
            }
        }
        return undefined;
    }
    /** Snapshot of persisted + session trust entries, for /approvals. */
    trustListing() {
        return {
            projectTools: [...this.projectAllowedTools],
            projectPatterns: [...this.projectPatterns],
            sessionPatterns: [...this.sessionPatterns],
        };
    }
    /** Remove a persisted entry by its /approvals listing coordinates. */
    removeTrustEntry(kind, index) {
        if (kind === 'project-tool') {
            const tools = [...this.projectAllowedTools];
            const [removed] = tools.splice(index, 1);
            if (removed === undefined)
                return false;
            this.projectAllowedTools.delete(removed);
            this.sessionAllowedTools.delete(removed);
            saveProjectApprovals([...this.projectAllowedTools], this.projectPatterns);
            return true;
        }
        const list = kind === 'project-pattern' ? this.projectPatterns : this.sessionPatterns;
        return index >= 0 && index < list.length ? (list.splice(index, 1), true) : false;
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
        this.stateValue = { ...this.state, question: request };
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
            this.stateValue = { ...this.state, question: undefined };
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
            this.stateValue = { ...this.state, question: undefined };
            this.publish();
        }
        resolve?.({ kind: 'dismissed' });
    }
    /**
     * Shell-like comfort: Enter on an EMPTY prompt echoes the prompt line
     * (`0% > `) into the transcript, pushing the conversation up one row, the
     * way a shell prints a fresh prompt. One message per press — `<Static>`
     * prints an item exactly once and never repaints it, so a reused id would
     * make every press after the first invisible.
     */
    appendPromptEcho(gutter) {
        const messages = [...this.state.messages];
        this.echoSeq += 1;
        messages.push({
            id: `echo-${this.echoSeq}`,
            kind: 'echo',
            text: gutter,
            tool: undefined,
            createdAt: Date.now(),
            seq: messages.length,
            usage: undefined,
            streaming: false,
        });
        this.stateValue = { ...this.state, messages };
        this.publish();
    }
    /** Patch the agent snapshot (used by status bar updates outside the event bus). */
    patchAgent(snapshot) {
        this.stateValue = {
            ...this.state,
            agent: { ...this.state.agent, ...snapshot },
        };
        this.publish();
    }
    /**
     * Coalesce streaming-delta publishes: the gateway emits ~40 chunks/s,
     * and one full React/Ink re-render per chunk makes the terminal flicker.
     * Trailing-edge throttle at ~12 fps keeps text flowing while cutting the
     * redraw rate of the tall live region.
     */
    publishStreaming() {
        if (this.publishTimer !== undefined)
            return;
        this.publishTimer = setTimeout(() => {
            this.publishTimer = undefined;
            this.publish();
        }, 100);
    }
    /** Replay mode: applyEvent must not publish per event (see replayEvents). */
    replaying = false;
    /** C1: called after every turn/end (auto-checkpoint, set by the runtime). */
    turnEndHook;
    /** Notify subscribers of a state change. */
    publish() {
        if (this.replaying)
            return;
        const snapshot = this.state;
        for (const listener of this.listeners)
            listener(snapshot);
    }
    /** Apply one session event. */
    /**
     * Context usage from the platform's token-meter contextPressure
     * projection (projectedTokens = confirmed pressure + surface estimate).
     * Provider usage chunks are unreliable (many gateways send none), so this
     * projection is the primary source — the same numbers the Web UI shows.
     */
    refreshContextUsage() {
        if (this.agent === undefined || this.boundCtx === undefined)
            return;
        try {
            // The registry is a Cordis service: property access on the context
            // proxy returns undefined without inject — go through ctx.get.
            const projections = this.boundCtx.get?.('sessionProjections');
            const pressure = projections?.stateOf?.(this.agent.session, 'contextPressure');
            const used = pressure?.projectedTokens ?? pressure?.pressureTokens;
            if (used !== undefined && used > 0 && used !== this.state.agent.contextUsedTokens) {
                this.stateValue = { ...this.state, agent: { ...this.state.agent, contextUsedTokens: used, contextApprox: false } };
            }
            // The window the request DECLARED (pi-ai resolves it from its own
            // catalog, including a provider default) — authoritative and available
            // for models our settings catalog does not list, which is what made the
            // prompt's `0% >` usage gutter vanish for them.
            const window = pressure?.contextWindow;
            if (window !== undefined && window > 0 && window !== this.state.agent.contextLimitTokens) {
                this.stateValue = { ...this.state, agent: { ...this.state.agent, contextLimitTokens: window } };
            }
        }
        catch {
            // projection unavailable: chunk-usage sampling remains the fallback
        }
    }
    /**
     * Permission preset from the platform's permissions projection — the
     * authoritative CURRENT value. Live events alone miss restored sessions
     * (the preset event precedes our bind), so read the projection too.
     */
    refreshPermissionPreset() {
        if (this.agent === undefined || this.boundCtx === undefined)
            return;
        try {
            const projections = this.boundCtx.get?.('sessionProjections');
            const state = projections?.stateOf?.(this.agent.session, 'permissions');
            const preset = typeof state?.preset === 'string' ? state.preset : undefined;
            if (preset !== undefined && preset !== this.state.agent.permissionPreset) {
                this.stateValue = { ...this.state, agent: { ...this.state.agent, permissionPreset: preset } };
            }
        }
        catch {
            // projection unavailable: event-driven updates still apply
        }
    }
    /**
     * Ingest one synthetic session event (the kiro-loop turn driver fabricates
     * the same durable shapes the platform loop emits, so the projection and
     * UI render identically for both drivers).
     */
    ingestEvent(event) {
        this.applyEvent(event);
    }
    applyEvent(event) {
        this.refreshContextUsage();
        this.refreshPermissionPreset();
        switch (event.type) {
            case 'turn/start': {
                this.turnStartedAt = Date.now();
                this.stateValue = {
                    ...this.state,
                    agent: { ...this.state.agent, status: 'running' },
                };
                this.publish();
                return;
            }
            case 'turn/end': {
                // C1: runtime hook — auto-checkpoint after every completed turn.
                try {
                    this.turnEndHook?.();
                }
                catch { /* never break the turn */ }
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
                    // Classify (rate-limit / timeout / 5xx / auth / network / model)
                    // and name the concrete next move: wait the provider-requested
                    // backoff, /retry the same prompt, or switch with /model.
                    this.pushSystem(classifyTurnFailure(reason.error, message).text);
                }
                this.stateValue = {
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
                // A cancelled/errored turn can end mid-stream: close the trailing
                // streaming segment so it stops pinning the live region.
                this.closeStreamingAssistant();
                this.closeStreamingReasoning();
                this.publish();
                return;
            }
            case 'assistant/message': {
                this.markFirstToken();
                const data = event.data;
                const text = contentToText(data.message.content);
                const seq = Number(event.seq);
                // A streamed segment is already on screen (possibly with settled
                // continuation pieces). Finalize it in place with the durable text
                // instead of appending a second copy — appending rendered the whole
                // answer twice and, worse, left the streamed copy `streaming: true`
                // forever, pinning every later message into Ink's live region.
                this.closeStreamingAssistant({ seq, text });
                const tail = this.state.messages.at(-1);
                if (tail?.kind !== 'assistant' || tail.streaming || tail.seq !== seq) {
                    // No streamed segment was finalized for this durable message —
                    // non-streamed model or a different segment: append it.
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
                    this.stateValue = { ...this.state, messages: [...this.state.messages, message] };
                }
                this.publish();
                return;
            }
            case 'assistant/chunk': {
                const chunk = event.data.chunk;
                if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
                    this.markFirstToken();
                    this.appendToLastAssistant(chunk.text);
                    return;
                }
                if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
                    this.markFirstToken();
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
                this.markFirstToken();
                this.closeStreamingReasoning();
                const data = event.data;
                const seq = Number(event.seq);
                const record = {
                    id: idFor('tool-call', seq),
                    callId: data.callId,
                    argsRaw: typeof data.arguments === 'string'
                        ? data.arguments
                        : (data.arguments !== undefined ? JSON.stringify(data.arguments) : undefined),
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
                this.stateValue = {
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
                        this.stateValue = {
                            ...this.state,
                            hasActiveTool: this.activeTools.size > 0,
                            messages,
                        };
                    }
                    else {
                        this.stateValue = { ...this.state, hasActiveTool: this.activeTools.size > 0 };
                    }
                    this.publish();
                }
                return;
            }
            case 'request/context': {
                const data = event.data;
                // The adapter's effective window for THIS request (catalog value or
                // its route-level default) — the same truth the Web UI's token-meter
                // projection renders. Lands before the request runs, so the bar is
                // correct from the first turn and after any model switch.
                if (typeof data.contextWindow === 'number' && Number.isFinite(data.contextWindow) && data.contextWindow > 0) {
                    this.stateValue = {
                        ...this.state,
                        agent: {
                            ...this.state.agent,
                            contextLimitTokens: data.contextWindow,
                            ...(data.provider !== undefined ? { activeProvider: data.provider } : {}),
                            ...(data.model !== undefined ? { activeModel: data.model } : {}),
                        },
                    };
                    this.publish();
                }
                else if (data.provider !== undefined || data.model !== undefined) {
                    this.stateValue = {
                        ...this.state,
                        agent: {
                            ...this.state.agent,
                            ...(data.provider !== undefined ? { activeProvider: data.provider } : {}),
                            ...(data.model !== undefined ? { activeModel: data.model } : {}),
                        },
                    };
                    this.publish();
                }
                return;
            }
            case 'user/message': {
                const data = event.data;
                // Only what the user actually typed/attached: platform-injected
                // notices (compaction summaries, queue texts) use other source kinds.
                if (data.source?.kind !== 'user')
                    return;
                const text = contentToText(data.content ?? []).trim();
                if (text === '')
                    return;
                if (text === this.lastSteeredText) {
                    this.lastSteeredText = undefined;
                    return;
                }
                const seq = this.state.messages.length + 1;
                const message = {
                    id: idFor('user', seq),
                    kind: 'user',
                    text,
                    tool: undefined,
                    createdAt: Date.now(),
                    seq,
                    usage: undefined,
                    streaming: false,
                };
                this.stateValue = { ...this.state, messages: [...this.state.messages, message] };
                this.publish();
                return;
            }
            default: {
                // `plan/mode` (dsh-plan-mode) and `permission/preset`
                // (dsh-permission-presets) arrive via event augmentations this
                // bundle does not type-depend on — match structurally.
                const wide = event;
                if (wide.type === 'plan/mode') {
                    const active = wide.data?.active === true;
                    this.stateValue = {
                        ...this.state,
                        agent: { ...this.state.agent, planMode: active },
                    };
                    this.publish();
                    return;
                }
                if (wide.type === 'todo/write') {
                    // Whole-list snapshot from the todo_write tool (turn/start clears
                    // it upstream). Pin the list and drop a compact checklist row
                    // into the transcript — kiro-style visible progress.
                    const todos = wide.data.todos ?? undefined;
                    this.stateValue = { ...this.state, todos };
                    if (todos !== undefined && todos.length > 0)
                        this.pushTodoSnapshot(todos);
                    this.publish();
                    return;
                }
                if (wide.type === 'permission/preset' && typeof wide.data?.preset === 'string') {
                    this.stateValue = {
                        ...this.state,
                        agent: { ...this.state.agent, permissionPreset: wide.data.preset },
                    };
                    this.publish();
                }
                return;
            }
        }
    }
    /**
     * Close any tool-call message still marked streaming (a result that never
     * correlated, or a turn cancelled mid-call). A stuck `streaming` flag
     * pins every later message into Ink's live region, so the whole UI
     * re-renders each spinner tick — this sweep is the backstop.
     */
    sweepOrphanedToolCalls() {
        this.closeStreamingReasoning();
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
            this.stateValue = { ...this.state, messages };
        }
    }
    /**
     * Close any reasoning message still marked streaming. Reasoning deltas
     * only stream; nothing in the chunk flow closes them, yet a stuck flag
     * pins the whole later transcript into Ink's live region. Called whenever
     * the model demonstrably moved on (text, a tool call) and at turn end.
     */
    closeStreamingReasoning() {
        let changed = false;
        const messages = this.state.messages.map((message) => {
            if (message.kind === 'reasoning' && message.streaming) {
                changed = true;
                return { ...message, streaming: false };
            }
            return message;
        });
        if (changed) {
            this.stateValue = { ...this.state, messages };
        }
    }
    /**
     * Append to the streaming assistant segment, settling complete blocks.
     *
     * Ink's live region is erased and rewritten in full on every frame, so a
     * streaming answer that stays whole makes the redraw cost (and the visible
     * flicker) grow with the answer length. Instead, each delta first settles
     * every COMPLETE safe block (see `settleCut`) into its own finished
     * `continuation` message — those go into Ink's `<Static>` and are printed
     * exactly once — and only the unfinished tail stays live.
     */
    appendToLastAssistant(delta) {
        if (delta === '')
            return;
        this.closeStreamingReasoning();
        const messages = [...this.state.messages];
        const last = messages.at(-1);
        let segment;
        if (last?.kind === 'assistant' && last.streaming) {
            segment = { ...last, text: last.text + delta, streaming: true };
        }
        else {
            segment = {
                id: idFor('assistant', messages.length),
                kind: 'assistant',
                text: delta,
                tool: undefined,
                createdAt: Date.now(),
                seq: messages.length,
                usage: undefined,
                streaming: true,
            };
        }
        const settledUpTo = segment.settledUpTo ?? 0;
        // Block boundaries first; a single unbroken line (a wall of text with no
        // newline at all) has no boundary to cut at, so it is capped separately —
        // otherwise the whole answer lives in Ink's live region and never reaches
        // the scrollback until the turn ends.
        const blockCut = settleCut(segment.text);
        const rawCut = blockCut > settledUpTo
            ? blockCut
            : wallCut(segment.text, settledUpTo, liveTailRows(), (process.stdout.columns ?? 100) - 4);
        // Defensive: a settle offset may never pass the text end (a piece would
        // then be clamped short while the tail's offset moved further).
        const cut = Math.min(rawCut, segment.text.length);
        const piece = cut > settledUpTo
            ? {
                id: idFor('assistant-settled', messages.length),
                kind: 'assistant',
                // Drop the boundary newline — a piece is its own markdown block.
                text: settlePieceText(segment.text, settledUpTo, cut),
                tool: undefined,
                createdAt: segment.createdAt,
                seq: segment.seq,
                usage: undefined,
                streaming: false,
                settledUpTo: 0,
                continuation: settledUpTo > 0,
            }
            : undefined;
        if (piece !== undefined)
            segment = { ...segment, settledUpTo: cut };
        if (last?.kind === 'assistant' && last.streaming) {
            // Replace the trailing segment with [settled piece?, segment tail].
            messages[messages.length - 1] = piece ?? segment;
            if (piece !== undefined)
                messages.push(segment);
        }
        else {
            if (piece !== undefined)
                messages.push(piece);
            messages.push(segment);
        }
        this.stateValue = { ...this.state, messages };
        this.publishStreaming();
    }
    /**
     * Finalize a trailing streaming assistant segment in place: drop the part
     * already settled (it was emitted as continuation messages) and mark the
     * remainder finished. Used by the durable `assistant/message` commit and as
     * the safety net on turn end / cancel.
     */
    closeStreamingAssistant(replacement) {
        const messages = this.state.messages;
        const last = messages.at(-1);
        if (last?.kind !== 'assistant' || !last.streaming)
            return;
        const settled = last.settledUpTo ?? 0;
        const settledPrefix = last.text.slice(0, settled);
        let tail = last.text.slice(settled);
        if (replacement !== undefined && replacement.text.startsWith(settledPrefix)) {
            // The durable commit is the authority: show its remainder (guards
            // against stream/durable drift in the still-live tail only).
            tail = replacement.text.slice(settled);
        }
        const finalized = {
            ...last,
            id: replacement !== undefined ? idFor('assistant', replacement.seq) : last.id,
            seq: replacement !== undefined ? replacement.seq : last.seq,
            text: tail,
            settledUpTo: 0,
            continuation: settled > 0 || last.continuation === true,
            streaming: false,
        };
        this.stateValue = { ...this.state, messages: [...messages.slice(0, -1), finalized] };
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
        this.stateValue = { ...this.state, messages };
        this.publishStreaming();
    }
    /** Record the latest token-usage sample for the StatusBar. */
    recordUsage(usage) {
        const input = usage.inputTokens ?? 0;
        const output = usage.outputTokens ?? 0;
        const total = usage.totalTokens ?? input + output;
        this.stateValue = {
            ...this.state,
            agent: { ...this.state.agent, contextUsedTokens: total, contextApprox: false },
        };
        const messages = [...this.state.messages];
        const last = messages.at(-1);
        if (last?.kind === 'assistant') {
            messages[messages.length - 1] = { ...last, usage: { input, output } };
            this.stateValue = { ...this.state, messages };
        }
        // Context-pressure nudges (P3): one hint per threshold per session; a
        // drop under 50% (compaction / new chat) re-arms them.
        const limit = this.state.agent.contextLimitTokens;
        if (limit !== undefined && limit > 0) {
            const pct = (total / limit) * 100;
            if (pct >= 80 && !this.contextHints.t80) {
                this.contextHints.t80 = true;
                this.contextHints.t60 = true;
                this.pushSystem(`⚠ 上下文已用 ${Math.round(pct)}%，接近上限。建议 /compact 压缩历史，或 /chat new 开新会话。`);
            }
            else if (pct >= 60 && !this.contextHints.t60) {
                this.contextHints.t60 = true;
                this.pushSystem(`ℹ 上下文已用 ${Math.round(pct)}%。可在不影响当前任务的前提下考虑 /compact。`);
            }
            else if (pct < 50) {
                this.contextHints.t60 = false;
                this.contextHints.t80 = false;
            }
        }
        this.publish();
    }
}
//# sourceMappingURL=session-controller.js.map