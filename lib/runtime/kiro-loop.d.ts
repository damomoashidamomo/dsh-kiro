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
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** Minimal chat message the driver keeps. */
export interface LoopMessage {
    readonly role: 'user' | 'assistant';
    readonly text: string;
}
export interface LoopDriverDeps {
    readonly ctx: Context;
    readonly controller: {
        ingestEvent(event: SessionEvent): void;
    };
    /** System prompt (steering-composed); the driver appends nothing. */
    readonly systemPrompt: () => string;
    /** Current provider/model/effort selection. */
    readonly selection: () => {
        provider: string;
        model: string;
        reasoningEffort?: string;
    };
}
/**
 * One turn driver instance per mode switch. History is seeded from the
 * transcript so a mid-session /loop switch continues the conversation.
 */
export declare class KiroLoopDriver {
    private readonly deps;
    private history;
    private abort;
    constructor(deps: LoopDriverDeps);
    /** Seed the chat history from already-rendered transcript messages. */
    seed(messages: readonly {
        kind: string;
        text: string;
    }[]): void;
    get busy(): boolean;
    /** Abort the in-flight turn (Ctrl+C path). */
    cancel(): void;
    /** Run one turn: stream the model reply into the transcript. */
    runTurn(userText: string): Promise<void>;
}
/** Session id the driver's synthetic events carry (unused by projection). */
export declare const KIRO_LOOP_SESSION: SessionId;
