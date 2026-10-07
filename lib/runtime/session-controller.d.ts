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
import type { AgentStatusSnapshot, ApprovalChoice, ApprovalRequestUi, OverlayKind, PickerItem, SessionRenderState } from './types';
/** Subscriber callback when the render state changes. */
export type StateListener = (state: SessionRenderState) => void;
/**
 * The controller that projects session events onto UI state. One instance per
 * runtime plugin; the controller does not own the agent — it follows whatever
 * agent the runtime plugin creates.
 */
export declare class SessionController {
    private state;
    private readonly listeners;
    private agent;
    private unsubscribe;
    private activeTool;
    /** Subscribe to state changes. Returns the disposer. */
    subscribe(listener: StateListener): () => void;
    /** Snapshot of the current state. */
    getState(): SessionRenderState;
    /** Wipe the visible transcript without touching the durable session log. */
    clearTranscript(): void;
    /** Replace the controlled agent and rebind session events. */
    bindAgent(ctx: Context, agent: Agent): void;
    /** Detach the controlled agent. */
    unbind(): void;
    /** Push a UI overlay state change. */
    setOverlay(overlay: OverlayKind): void;
    /** Append a system message to the transcript (for slash command feedback). */
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
    /** Patch the agent snapshot (used by status bar updates outside the event bus). */
    patchAgent(snapshot: Partial<AgentStatusSnapshot>): void;
    /** Notify subscribers of a state change. */
    private publish;
    /** Apply one session event. */
    private applyEvent;
    /** Append to the last assistant message, creating it if absent. */
    private appendToLastAssistant;
    /** Append a reasoning block to a dedicated message. */
    private appendReasoning;
    /** Record the latest token-usage sample for the StatusBar. */
    private recordUsage;
}
