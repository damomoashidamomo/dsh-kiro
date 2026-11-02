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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AgentStatusSnapshot, ApprovalChoice, ApprovalRequestUi, OverlayKind, PickerItem, QuestionChoice, QuestionRequestUi, SessionRenderState } from './types';
/** Subscriber callback when the render state changes. */
export type StateListener = (state: SessionRenderState) => void;
/** One finer-grained trust entry: commands of `tool` starting with `prefix`. */
export interface ApprovalPattern {
    readonly tool: string;
    readonly prefix: string;
}
/**
 * The controller that projects session events onto UI state. One instance per
 * runtime plugin; the controller does not own the agent — it follows whatever
 * agent the runtime plugin creates.
 */
export declare class SessionController {
    private state;
    private readonly listeners;
    private agent;
    /** App context (for platform projections such as contextPressure). */
    private boundCtx;
    /** Disposer for the agent/assistant-stream live-chunk listener. */
    private unsubscribeStream;
    /** Coalesced publish timer for streaming deltas (anti-flicker). */
    private publishTimer;
    private unsubscribe;
    /** In-flight tool calls keyed by platform callId (parallel-safe). */
    private readonly activeTools;
    /**
     * Text of the most recent steer, already echoed locally as `↪ 已插话`.
     * The platform delivers the same text as a `user/message` when the next
     * step consumes it — match and drop to avoid a duplicate row.
     */
    private lastSteeredText;
    /** Subscribe to state changes. Returns the disposer. */
    subscribe(listener: StateListener): () => void;
    /** Snapshot of the current state. */
    getState(): SessionRenderState;
    /** Wipe the visible transcript without touching the durable session log. */
    clearTranscript(): void;
    /** Replace the controlled agent and rebind session events. */
    bindAgent(ctx: Context, agent: Agent): void;
    /** Abort the active turn via the platform's kiroInterrupt service. */
    cancelActiveTurn(): void;
    /** Detach the controlled agent. */
    unbind(): void;
    /** Push a UI overlay state change. */
    setOverlay(overlay: OverlayKind): void;
    /** Append a system message to the transcript (for slash command feedback). */
    /** Record a steered input already echoed locally (dedupe on arrival). */
    noteSteered(text: string): void;
    /** Append a todo checklist snapshot, skipping no-op duplicates. */
    private pushTodoSnapshot;
    pushSystem(text: string): void;
    /** Selection callback stored out-of-band (never part of the render state). */
    private pickerOnSelect;
    /**
     * Open an interactive picker. The command handler builds the items and
     * supplies an `onSelect` closure (it owns the apply logic — persist,
     * patch, push feedback); the controller only manages selection state.
     */
    openPicker(request: {
        title: string;
        items: readonly PickerItem[];
        onSelect: (item: PickerItem) => void;
    }): void;
    /** Close the picker without selecting. */
    closePicker(): void;
    /** Move the highlighted row by `delta`, clamped to the list. */
    movePickerSelection(delta: number): void;
    /** Jump the highlight to an absolute index (used by filtered picker views). */
    setPickerSelection(index: number): void;
    /** Confirm the highlighted row: runs the opener's callback, then closes. */
    selectPickerItem(): void;
    /** Resolver for the currently pending approval question, if any. */
    private approvalResolve;
    /** Approval signal cleanup for the currently pending question. */
    private approvalSignalCleanup;
    /** Tools the user allowed for the rest of this session (per-boot memory). */
    private readonly sessionAllowedTools;
    /** Context-pressure hints fired this session (dedupe; reset under 50%). */
    private readonly contextHints;
    /** Wall-clock of the open turn's start (TTFT numerator). */
    private turnStartedAt;
    /** Record first-token latency once per turn (P8). */
    private markFirstToken;
    /**
     * Project-level approvals (`.kiro/approvals.json` in the workspace):
     * tools the user marked "always allow for this project" (whole-tool), and
     * command-prefix patterns for finer trust (e.g. every `grep ...` inside
     * bash). Seeded at construction and rewritten on each allow choice.
     */
    private readonly projectAllowedTools;
    private readonly projectPatterns;
    /** Session-scoped prefix patterns (chosen via 本会话 + 前缀). */
    private readonly sessionPatterns;
    constructor();
    /** Resolver for the currently pending question, if any. */
    private questionResolve;
    /** Question signal cleanup for the currently pending question. */
    private questionSignalCleanup;
    /**
     * Put a permission question to the user. Resolves when the UI answers,
     * or with `{ kind: 'cancelled' }` when the request signal aborts (turn
     * cancelled) or the turn closes — the approval service discards late
     * answers itself, so cancelling here only needs to close the panel.
     */
    openApproval(request: ApprovalRequestUi, signal?: {
        aborted: boolean;
        addEventListener?: (t: string, l: () => void) => unknown;
        removeEventListener?: (t: string, l: () => void) => unknown;
    }): Promise<ApprovalChoice>;
    /** Answer the pending question (UI path) and close the panel. */
    resolveApproval(choice: ApprovalChoice): void;
    /** Withdraw the question without a user answer (signal/turn end). */
    cancelApproval(): void;
    /** Whether the user allowed this tool for the whole session. */
    isToolAllowedForSession(toolName: string): boolean;
    /** Remember a session-wide allowance for this tool (本会话始终允许). */
    allowToolForSession(toolName: string): void;
    /** Remember a project-wide allowance (本项目始终允许) and persist it. */
    allowToolForProject(toolName: string): void;
    /** Persist a finer-grained project trust pattern (命令/前缀). */
    allowPatternForProject(pattern: ApprovalPattern): void;
    /** Remember a session-scoped trust pattern. */
    allowPatternForSession(pattern: ApprovalPattern): void;
    /**
     * Whether a pending tool request matches a stored trust pattern. `args`
     * is the full argument JSON from the tool/call event; matching compares
     * the command-relevant string (bash: `command`, others: full JSON) as a
     * prefix.
     */
    matchesTrustPattern(toolName: string, args: string | undefined): boolean;
    /** Latest recorded argument payload for a tool name (or undefined). */
    latestToolArgs(toolName: string): string | undefined;
    /** Snapshot of persisted + session trust entries, for /approvals. */
    trustListing(): {
        projectTools: readonly string[];
        projectPatterns: readonly ApprovalPattern[];
        sessionPatterns: readonly ApprovalPattern[];
    };
    /** Remove a persisted entry by its /approvals listing coordinates. */
    removeTrustEntry(kind: 'project-tool' | 'project-pattern' | 'session-pattern', index: number): boolean;
    /**
     * Put a structured question to the user (plan review, generic ask).
     * Resolves when the UI answers, or with `{ kind: 'dismissed' }` when the
     * request signal aborts or the turn closes — the caller maps a dismissal
     * to ASK_CANCELLED semantics (stay and wait for the user's own words).
     */
    openQuestion(request: QuestionRequestUi, signal?: {
        aborted: boolean;
        addEventListener?: (t: string, l: () => void) => unknown;
        removeEventListener?: (t: string, l: () => void) => unknown;
    }): Promise<QuestionChoice>;
    /** Answer the pending question (UI path) and close the panel. */
    resolveQuestion(choice: QuestionChoice): void;
    /** Withdraw the question without a user answer (signal/turn end). */
    cancelQuestion(): void;
    /** Patch the agent snapshot (used by status bar updates outside the event bus). */
    patchAgent(snapshot: Partial<AgentStatusSnapshot>): void;
    /**
     * Coalesce streaming-delta publishes: the gateway emits ~40 chunks/s,
     * and one full React/Ink re-render per chunk makes the terminal flicker.
     * Trailing-edge throttle at ~12 fps keeps text flowing while cutting the
     * redraw rate of the tall live region.
     */
    private publishStreaming;
    /** Notify subscribers of a state change. */
    private publish;
    /** Apply one session event. */
    /**
     * Context usage from the platform's token-meter contextPressure
     * projection (projectedTokens = confirmed pressure + surface estimate).
     * Provider usage chunks are unreliable (many gateways send none), so this
     * projection is the primary source — the same numbers the Web UI shows.
     */
    private refreshContextUsage;
    /**
     * Permission preset from the platform's permissions projection — the
     * authoritative CURRENT value. Live events alone miss restored sessions
     * (the preset event precedes our bind), so read the projection too.
     */
    private refreshPermissionPreset;
    private applyEvent;
    /**
     * Close any tool-call message still marked streaming (a result that never
     * correlated, or a turn cancelled mid-call). A stuck `streaming` flag
     * pins every later message into Ink's live region, so the whole UI
     * re-renders each spinner tick — this sweep is the backstop.
     */
    private sweepOrphanedToolCalls;
    /**
     * Close any reasoning message still marked streaming. Reasoning deltas
     * only stream; nothing in the chunk flow closes them, yet a stuck flag
     * pins the whole later transcript into Ink's live region. Called whenever
     * the model demonstrably moved on (text, a tool call) and at turn end.
     */
    private closeStreamingReasoning;
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
    private appendToLastAssistant;
    /**
     * Finalize a trailing streaming assistant segment in place: drop the part
     * already settled (it was emitted as continuation messages) and mark the
     * remainder finished. Used by the durable `assistant/message` commit and as
     * the safety net on turn end / cancel.
     */
    private closeStreamingAssistant;
    /** Append a reasoning block to a dedicated message. */
    private appendReasoning;
    /** Record the latest token-usage sample for the StatusBar. */
    private recordUsage;
}
