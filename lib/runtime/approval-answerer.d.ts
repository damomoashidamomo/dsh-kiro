/**
 * The TUI's answerer for the platform's `approval/request` waterfall
 * (`dsh-user-approval`). The service itself never prompts a human — a
 * deployment composes answerers, and this one shows kiro's permission panel
 * through the SessionController and waits for the user's choice.
 *
 * Outcome mapping (platform vocabulary is one-shot by design):
 * - 允许一次        → 'allowed-once'
 * - 本会话始终允许  → remember the tool in the controller's per-session set,
 *                      answer 'allowed-once' for it (and every later ask)
 * - 拒绝（+理由）   → 'rejected'; a non-empty reason is injected to the model
 *                      as user feedback at the next step boundary so it can
 *                      adjust course instead of retrying blind
 * - signal abort    → 'cancelled' (the service settles cancelled itself; late
 *                      answers are discarded, so we only need to not hang)
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/approval-answerer
 */
import type { ApprovalChoice, ApprovalRequestUi } from './types';
/** Minimal structural shape of the platform's ApprovalRequestEvent. */
export interface ApprovalRequestLike {
    readonly toolName: string;
    readonly reason?: string;
    readonly signal?: {
        aborted: boolean;
        addEventListener?: (type: string, listener: () => void) => unknown;
        removeEventListener?: (type: string, listener: () => void) => unknown;
    };
}
/** Platform approval outcome vocabulary (subset this answerer returns). */
export type ApprovalOutcomeLike = 'allowed-once' | 'rejected' | 'cancelled';
/** Feedback channel used after a deny-with-reason. */
export interface ApprovalFeedback {
    inject(text: string): void;
}
/** UI hub the answerer drives (SessionController structural shape). */
export interface ApprovalUi {
    isToolAllowedForSession(toolName: string): boolean;
    allowToolForSession(toolName: string): void;
    openApproval(request: ApprovalRequestUi, signal?: ApprovalRequestLike['signal']): Promise<ApprovalChoice>;
}
/**
 * Build the waterfall listener. `next()` is never called: the TUI is a
 * terminal answerer, not a pass-through.
 */
export declare function createApprovalAnswerer(ui: ApprovalUi, feedback: ApprovalFeedback): (req: ApprovalRequestLike) => Promise<ApprovalOutcomeLike>;
