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
    /** The platform agent on whose behalf tools run (A1: approvals are
     *  agent-scoped; without this the platform approval waterfall never fires
     *  and tools execute unapproved). */
    readonly agent?: () => unknown;
    /**
     * The agent-scoped context (A1): the platform loop dispatches tools from
     * the agent scope, and the SCOPED tools view is what routes the approval
     * waterfall to agent-scoped listeners — our answerer. Taking ctx.tools
     * from the runtime scope left approval requests undeliverable.
     */
    readonly agentCtx?: () => unknown;
    /**
     * A1/A2: kiro-loop's OWN approval gate — the same panel, trust store, and
     * scope semantics the platform loop reaches through its waterfall, called
     * directly so BOTH tool engines (platform pipeline and Rust) are gated
     * identically. Returns 'allowed-once' | 'rejected' | 'cancelled'.
     */
    readonly approvalGate?: (req: {
        toolName: string;
        signal: AbortSignal;
    }) => Promise<string>;
    /** Permission preset: 'danger-full-access' auto-allows the gate. */
    readonly permissionPreset?: () => string | undefined;
}
/** One turn driver instance per mode switch. */
export declare class KiroLoopDriver {
    private readonly deps;
    private history;
    private abort;
    private settings;
    /** Tool engine preference (/tools rust|dsh); rust needs engineBinary(). */
    engine: 'dsh' | 'rust';
    workspaceRoot: string;
    constructor(deps: LoopDriverDeps);
    /** Reload `.kiro/tools.json` (after the user edits the matrix). */
    reloadSettings(): void;
    /** Whether the Rust engine binary is available right now. */
    engineAvailable(): boolean;
    /** Seed the chat history from already-rendered transcript messages. */
    seed(messages: readonly {
        kind: string;
        text: string;
    }[]): void;
    private steering;
    private traceLog;
    /** T1: recent loop trace entries (newest last), for /loop trace. */
    trace(limit?: number): readonly {
        at: number;
        text: string;
    }[];
    private traced;
    get busy(): boolean;
    /** A4: queue a mid-turn interjection; consumed at the next step boundary. */
    steer(text: string): void;
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
    /**
     * Execute one round's tool calls. When every call is read-only-safe
     * (P3 parallel dispatch, capped at 4 in flight) the round overlaps —
     * matches how Claude Code / kiro-cli fan out independent reads. Any
     * mutating call (bash / write / edit...) forces the whole round sequential.
     */
    private executeCalls;
    /** Compact history when usage exceeds COMPACT_AT of the declared window. */
    private maybeCompact;
    /** One extra LLM call that summarizes the head of the history. */
    private summarize;
    /** Project the local history into wire messages (text + tool calls/results). */
    private wireMessages;
}
/** Read the sidecar log's events (oldest first); missing file -> empty. */
export declare function readSidecarEvents(workspaceRoot: string): unknown[];
