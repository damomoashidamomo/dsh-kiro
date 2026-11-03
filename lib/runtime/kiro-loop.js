/**
 * kiro-loop — dsh-kiro's own turn driver (P1: text-only chat).
 *
 * Instead of routing a submission into the platform's dsh-agent-loop, this
 * driver calls `ctx.llm.stream` directly with a locally assembled history,
 * and fabricates the SAME durable event shapes (`user/message`,
 * `assistant/chunk` text-deltas, `assistant/message`, `turn/start`,
 * `turn/end`) the platform loop emits — so the controller's projection and
 * the whole UI render identically for either driver.
 *
 * P1 scope (deliberate): plain conversation, no tool schemas. Tool dispatch
 * (via the platform's ctx.tools service — the seam the P0 probe verified)
 * and Rust sandboxed execution land in P2/P3 behind this same driver.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/kiro-loop
 */
import { brandString } from '@deepseek-ai/dsh-brand';
const fakeSessionId = brandString('session-kiro-loop');
/**
 * One turn driver instance per mode switch. History is seeded from the
 * transcript so a mid-session /loop switch continues the conversation.
 */
export class KiroLoopDriver {
    deps;
    history = [];
    abort;
    constructor(deps) {
        this.deps = deps;
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
    /** Abort the in-flight turn (Ctrl+C path). */
    cancel() {
        this.abort?.abort();
        this.abort = undefined;
    }
    /** Run one turn: stream the model reply into the transcript. */
    async runTurn(userText) {
        if (this.abort !== undefined)
            return;
        const llm = this.deps.ctx.llm;
        if (llm === undefined)
            throw new Error('kiro-loop: llm 服务不可用');
        const emit = (event) => { this.deps.controller.ingestEvent(event); };
        this.abort = new AbortController();
        const { provider, model, reasoningEffort } = this.deps.selection();
        this.history.push({ role: 'user', text: userText });
        emit({ type: 'turn/start', seq: 0, data: { turn: 1 } });
        emit({
            type: 'user/message',
            seq: 1,
            data: { content: [{ type: 'text', text: userText }], source: { kind: 'user' } },
        });
        let full = '';
        try {
            const options = {
                provider,
                model,
                ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
                system: this.deps.systemPrompt(),
                messages: this.history.map((m) => ({ role: m.role, content: [{ type: 'text', text: m.text }] })),
                signal: this.abort.signal,
            };
            for await (const chunk of llm.stream(options)) {
                if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
                    emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'reasoning-delta', text: chunk.text } } });
                }
                else if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
                    full += chunk.text;
                    emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'text-delta', text: chunk.text } } });
                }
                else if (chunk.type === 'usage') {
                    emit({ type: 'assistant/chunk', seq: 0, data: { chunk: { type: 'usage', usage: chunk.usage } } });
                }
            }
            this.history.push({ role: 'assistant', text: full });
            emit({ type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: full }] } } });
            emit({ type: 'turn/end', seq: 3, data: { reason: { kind: 'completed' } } });
        }
        catch (error) {
            const aborted = this.abort?.signal.aborted === true;
            this.history.push({ role: 'assistant', text: full });
            if (full !== '') {
                emit({ type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: full }] } } });
            }
            emit({
                type: 'turn/end',
                seq: 3,
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
}
/** Session id the driver's synthetic events carry (unused by projection). */
export const KIRO_LOOP_SESSION = fakeSessionId;
//# sourceMappingURL=kiro-loop.js.map