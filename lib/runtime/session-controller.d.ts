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
import type { AgentStatusSnapshot, OverlayKind, SessionRenderState } from './types';
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
    /** Replace the controlled agent and rebind session events. */
    bindAgent(ctx: Context, agent: Agent): void;
    /** Detach the controlled agent. */
    unbind(): void;
    /** Push a UI overlay state change. */
    setOverlay(overlay: OverlayKind): void;
    /** Append a system message to the transcript (for slash command feedback). */
    pushSystem(text: string): void;
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
