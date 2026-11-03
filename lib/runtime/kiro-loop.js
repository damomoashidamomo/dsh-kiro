/**
 * kiro-loop — dsh-kiro's own turn driver (P2: full tool loop).
 *
 * Instead of routing a submission into the platform's dsh-agent-loop, this
 * driver calls `ctx.llm.stream` directly with a locally assembled history and
 * tool schemas from `ctx.tools`, executes requested tools through the
 * platform tool pipeline (so sandbox / guards / approvals all apply — the
 * seam the P0 probe verified), feeds results back, and repeats until the
 * model stops calling tools. It fabricates the SAME durable event shapes the
 * platform loop emits, so the projection and UI render identically.
 *
 * Loop-hardening (P2, per the reviewed architecture):
 * - toolsSettings matrix (`.kiro/tools.json`, kiro-cli-compatible) evaluated
 *   BEFORE dispatch: deny-first, anchored regex, path globs,
 *   autoAllowReadonly for read-only shell commands.
 * - retry with backoff + stalled-stream protection: transient failures
 *   (rate-limit / 5xx / timeout) re-request up to twice; a stream silent for
 *   STALL_MS is aborted and retried.
 * - auto-compaction: usage beyond COMPACT_AT of the declared window
 *   summarizes the history (one extra LLM call) and keeps the tail verbatim.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/kiro-loop
 */
import { classifyTurnFailure } from "./turn-failure.js";
import { loadToolsSettings, verdictFor } from "./tool-settings.js";
import { toEngineCall, runEngineCall, engineBinary } from "../engine/bridge.js";
const MAX_STEPS = 24;
const MAX_RETRIES = 2;
const STALL_MS = 25000;
const COMPACT_AT = 0.8;
const PARALLEL_LIMIT = 4;
/** Read-only tools that may overlap within one round (P3 parallel dispatch). */
const PARALLEL_SAFE = new Set(['read', 'fs_read', 'read_file', 'grep', 'glob', 'ls', 'web_search', 'kiro_think']);
/** One turn driver instance per mode switch. */
export class KiroLoopDriver {
    deps;
    history = [];
    abort;
    settings = loadToolsSettings();
    /** Tool engine preference (/tools rust|dsh); rust needs engineBinary(). */
    engine = 'dsh';
    workspaceRoot = process.cwd();
    constructor(deps) {
        this.deps = deps;
    }
    /** Reload `.kiro/tools.json` (after the user edits the matrix). */
    reloadSettings() {
        this.settings = loadToolsSettings();
    }
    /** Whether the Rust engine binary is available right now. */
    engineAvailable() {
        return engineBinary() !== undefined;
    }
    /** Seed the chat history from already-rendered transcript messages. */
    seed(messages) {
        this.history = messages
            .filter((m) => (m.kind === 'user' || m.kind === 'assistant') && m.text.trim() !== '')
            .map((m) => ({ role: m.kind === 'user' ? 'user' : 'assistant', text: m.text }));
    }
    get busy() {
        return this.abort !== undefined;
    }
    cancel() {
        this.abort?.abort();
    }
    get llm() {
        return this.deps.ctx.llm;
    }
    get tools() {
        return this.deps.ctx.tools;
    }
    /** Run one full turn (inner tool loop until the model stops calling tools). */
    async runTurn(userText) {
        if (this.abort !== undefined)
            return;
        const llm = this.llm;
        if (llm === undefined)
            throw new Error('kiro-loop: llm 服务不可用');
        this.abort = new AbortController();
        const emit = (event) => { this.deps.controller.ingestEvent(event); };
        this.history.push({ role: 'user', text: userText });
        emit({ type: 'turn/start', seq: 0, data: { turn: 1 } });
        emit({ type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: userText }], source: { kind: 'user' } } });
        try {
            for (let step = 0; step < MAX_STEPS; step += 1) {
                await this.maybeCompact(llm, emit);
                const { text, toolCalls, finish } = await this.streamWithRetry(llm, emit);
                this.history.push({ role: 'assistant', text, ...(toolCalls.length > 0 ? { toolCalls } : {}) });
                emit({ type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text }] } } });
                if (finish !== 'tool-calls' || toolCalls.length === 0)
                    break;
                const results = await this.executeCalls(toolCalls, step, emit);
                this.history.push({ role: 'user', text: '', toolResults: results });
            }
            emit({ type: 'turn/end', seq: 9, data: { reason: { kind: 'completed' } } });
        }
        catch (error) {
            const aborted = this.abort?.signal.aborted === true;
            emit({
                type: 'turn/end',
                seq: 9,
                data: {
                    reason: aborted
                        ? { kind: 'cancelled' }
                        : { kind: 'error', error: { message: error instanceof Error ? error.message : String(error) } },
                },
            });
        }
        finally {
            this.abort = undefined;
        }
    }
    /** One model request with backoff retry and stalled-stream protection. */
    async streamWithRetry(llm, emit) {
        const { provider, model, reasoningEffort } = this.deps.selection();
        const schemas = this.tools?.schemas() ?? [];
        let lastError;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
            const turnAbort = this.abort;
            try {
                return await this.streamOnce(llm, {
                    provider,
                    model,
                    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
                    system: this.deps.systemPrompt(),
                    ...(schemas.length > 0 ? { tools: schemas } : {}),
                    messages: this.wireMessages(),
                    signal: turnAbort.signal,
                }, emit);
            }
            catch (error) {
                lastError = error;
                if (turnAbort.signal.aborted)
                    throw error;
                const transient = classifyTurnFailure(error, error instanceof Error ? error.message : String(error)).transient;
                if (!transient || attempt === MAX_RETRIES)
                    throw error;
                emit({ type: 'system/message', seq: 8, data: { text: `↻ 网络抖动，${attempt + 1}s 后自动重试（${attempt + 1}/${MAX_RETRIES}）…` } });
                await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
            }
        }
        throw lastError;
    }
    /** One streaming pass; a silent stream for STALL_MS aborts as a timeout. */
    async streamOnce(llm, options, emit) {
        let text = '';
        const toolCalls = [];
        let finish = 'stop';
        const iterator = llm.stream(options)[Symbol.asyncIterator]();
        try {
            while (true) {
                const next = await Promise.race([
                    iterator.next(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out: stream stalled')), STALL_MS)),
                ]);
                if (next.done === true)
                    break;
                const chunk = next.value;
                if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
                    text += chunk.text;
                    emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'text-delta', text: chunk.text } } });
                }
                else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
                    emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'reasoning-delta', text: chunk.text } } });
                }
                else if (chunk.type === 'block-end') {
                    const block = chunk.block;
                    if (block?.type === 'tool-call') {
                        toolCalls.push({
                            id: String(block.id ?? ''),
                            name: String(block.name ?? ''),
                            arguments: String(block.arguments ?? '{}'),
                        });
                    }
                }
                else if (chunk.type === 'usage') {
                    emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'usage', usage: chunk.usage } } });
                }
                else if (chunk.type === 'finish') {
                    const kind = chunk.reason?.kind ?? 'stop';
                    // Some adapters emit a trailing second finish after the real one;
                    // the first reason wins (a later 'stop' must not clobber
                    // 'tool-calls' and silently end the loop).
                    if (finish === 'stop')
                        finish = kind;
                }
            }
        }
        finally {
            void iterator.return?.().catch(() => undefined);
        }
        // Blocks speak for themselves: collected tool-call blocks always mean
        // the model wants tools, whatever the (possibly clobbered) finish said.
        const effectiveFinish = toolCalls.length > 0 ? 'tool-calls' : finish;
        return { text, toolCalls, finish: effectiveFinish };
    }
    /** toolsSettings verdict -> platform execute (or a synthesized refusal). */
    async executeTool(call) {
        let args = {};
        try {
            args = JSON.parse(call.arguments);
        }
        catch {
            args = {};
        }
        const verdict = verdictFor(this.settings, call.name, args);
        if (verdict === 'deny') {
            return { toolCallId: call.id, content: 'denied by workspace toolsSettings (.kiro/tools.json)', isError: true };
        }
        // Rust engine path (/tools rust): a freshly Landlock-sandboxed process
        // per call; anything the engine cannot serve falls through to the
        // platform pipeline below.
        if (this.engine === 'rust') {
            const engineCall = toEngineCall(call.name, args);
            if (engineCall !== undefined) {
                const reply = await runEngineCall(engineCall, this.workspaceRoot);
                if (reply.ok) {
                    return { toolCallId: call.id, content: JSON.stringify(reply.result ?? {}), isError: false };
                }
                if (!String(reply.error ?? '').includes('engine binary not built')) {
                    return { toolCallId: call.id, content: `rust engine: ${String(reply.error ?? 'failed')}`, isError: true };
                }
            }
        }
        const tools = this.tools;
        if (tools === undefined) {
            return { toolCallId: call.id, content: 'tool runtime unavailable', isError: true };
        }
        try {
            const result = await tools.execute({
                callId: call.id,
                name: call.name,
                arguments: args,
                signal: this.abort.signal,
            });
            const text = (result.content ?? [])
                .map((block) => (typeof block.text === 'string' ? block.text : ''))
                .join('\n');
            return { toolCallId: call.id, content: text !== '' ? text : JSON.stringify(result.value ?? ''), isError: result.isError };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { toolCallId: call.id, content: `tool error: ${message}`, isError: true };
        }
    }
    /**
     * Execute one round's tool calls. When every call is read-only-safe
     * (P3 parallel dispatch, capped at 4 in flight) the round overlaps —
     * matches how Claude Code / kiro-cli fan out independent reads. Any
     * mutating call (bash / write / edit...) forces the whole round sequential.
     */
    async executeCalls(calls, step, emit) {
        const emitCall = (call) => {
            emit({ type: 'tool/call', seq: 4, data: { turn: 1, step, callId: call.id, name: call.name, arguments: call.arguments } });
        };
        const emitResult = (callId, result) => {
            emit({
                type: 'tool/result',
                seq: 5,
                data: {
                    turn: 1,
                    step,
                    message: {
                        role: 'user',
                        content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: result.content }] }],
                    },
                },
            });
        };
        const runOne = async (call) => {
            emitCall(call);
            const result = await this.executeTool(call);
            emitResult(call.id, result);
            return result;
        };
        const parallelizable = calls.length > 1
            && calls.every((call) => PARALLEL_SAFE.has(call.name))
            && this.engine !== 'rust'; // one sandboxed engine process at a time
        if (!parallelizable) {
            const results = [];
            for (const call of calls)
                results.push(await runOne(call));
            return results;
        }
        const batches = [];
        for (let i = 0; i < calls.length; i += PARALLEL_LIMIT) {
            batches.push(calls.slice(i, i + PARALLEL_LIMIT));
        }
        const results = [];
        for (const batch of batches) {
            results.push(...await Promise.all(batch.map((call) => runOne(call))));
        }
        return results;
    }
    /** Compact history when usage exceeds COMPACT_AT of the declared window. */
    async maybeCompact(llm, emit) {
        const window = this.deps.contextWindow?.();
        if (window === undefined || window <= 0 || this.history.length < 6)
            return;
        const chars = this.history.reduce((sum, m) => sum + m.text.length, 0);
        const roughTokens = Math.round(chars * 0.4);
        if (roughTokens < window * COMPACT_AT)
            return;
        const tail = this.history.slice(-2);
        const head = this.history.slice(0, -2);
        try {
            const summary = await this.summarize(llm, head);
            this.history = [
                { role: 'user', text: `（前文自动压缩）${summary}` },
                ...tail,
            ];
            emit({ type: 'system/message', seq: 7, data: { text: `◇ 上下文接近窗口，已自动压缩历史（保留最近 ${tail.length} 条原文）。` } });
        }
        catch {
            // Summarization failed: keep going with the full history.
        }
    }
    /** One extra LLM call that summarizes the head of the history. */
    async summarize(llm, head) {
        const { provider, model } = this.deps.selection();
        const transcript = head.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.text.slice(0, 4000)}`).join('\n');
        let text = '';
        const iterator = llm.stream({
            provider,
            model,
            system: '把以下对话压缩成要点摘要，保留任务目标、已做决定与关键文件/命令名，直接输出摘要。',
            messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: transcript }] }],
            maxTokens: 512,
            signal: this.abort.signal,
        })[Symbol.asyncIterator]();
        while (true) {
            const next = await iterator.next();
            if (next.done === true)
                break;
            const chunk = next.value;
            if (chunk.type === 'text-delta' && typeof chunk.text === 'string')
                text += chunk.text;
        }
        return text.trim();
    }
    /** Project the local history into wire messages (text + tool calls/results). */
    wireMessages() {
        return this.history.map((m) => {
            if (m.role === 'user') {
                const blocks = [];
                if (m.text !== '')
                    blocks.push({ type: 'text', text: m.text });
                for (const result of m.toolResults ?? []) {
                    blocks.push({ type: 'tool-result', toolCallId: result.toolCallId, content: [{ type: 'text', text: result.content }], ...(result.isError ? { isError: true } : {}) });
                }
                return {
                    role: 'user',
                    source: { kind: 'user' },
                    content: blocks.length > 0 ? blocks : [{ type: 'text', text: m.text }],
                };
            }
            const blocks = [];
            if (m.text !== '')
                blocks.push({ type: 'text', text: m.text });
            for (const call of m.toolCalls ?? []) {
                blocks.push({ type: 'tool-call', id: call.id, name: call.name, arguments: call.arguments });
            }
            return { role: 'assistant', source: { kind: 'assistant' }, content: blocks };
        });
    }
}
//# sourceMappingURL=kiro-loop.js.map