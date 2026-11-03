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
import type { Context } from '@deepseek-ai/cordis';
/** Minimal chat message the driver keeps. */
export interface LoopMessage {
    readonly role: 'user' | 'assistant';
    readonly text: string;
    readonly toolCalls?: readonly {
        id: string;
        name: string;
        arguments: string;
    }[];
    readonly toolResults?: readonly {
        toolCallId: string;
        content: string;
        isError: boolean;
    }[];
}
export interface LoopDriverDeps {
    readonly ctx: Context;
    readonly controller: {
        ingestEvent(event: unknown): void;
    };
    readonly systemPrompt: () => string;
    readonly selection: () => {
        provider: string;
        model: string;
        reasoningEffort?: string;
    };
    /** Declared context window of the current model (tokens), when known. */
    readonly contextWindow?: () => number | undefined;
}
/** One turn driver instance per mode switch. */
export declare class KiroLoopDriver {
    private readonly deps;
    private history;
    private abort;
    private settings;
    constructor(deps: LoopDriverDeps);
    /** Reload `.kiro/tools.json` (after the user edits the matrix). */
    reloadSettings(): void;
    /** Seed the chat history from already-rendered transcript messages. */
    seed(messages: readonly {
        kind: string;
        text: string;
    }[]): void;
    get busy(): boolean;
    cancel(): void;
    private get llm();
    private get tools();
    /** Run one full turn (inner tool loop until the model stops calling tools). */
    runTurn(userText: string): Promise<void>;
    /** One model request with backoff retry and stalled-stream protection. */
    private streamWithRetry;
    /** One streaming pass; a silent stream for STALL_MS aborts as a timeout. */
    private streamOnce;
    /** toolsSettings verdict -> platform execute (or a synthesized refusal). */
    private executeTool;
    /** Compact history when usage exceeds COMPACT_AT of the declared window. */
    private maybeCompact;
    /** One extra LLM call that summarizes the head of the history. */
    private summarize;
    /** Project the local history into wire messages (text + tool calls/results). */
    private wireMessages;
}
