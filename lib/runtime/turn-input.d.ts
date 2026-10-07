/**
 * Routing for plain-text submissions: a running turn makes the message a
 * mid-flight steering input (consumed at the next step boundary of the LIVE
 * turn — the platform's `agent.steer()`), otherwise it opens a new turn via
 * `agent.followup()`. Extracted so the branch is unit-testable without
 * booting the whole runtime.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/turn-input
 */
/** Structural shape of the platform Agent members this router needs. */
export interface TurnInputTarget {
    readonly status: string;
    steer(message: unknown): void;
    followup(message: unknown): void;
}
/**
 * Deliver one user message to the agent. Returns which path was taken so the
 * caller can render the matching feedback line.
 */
export declare function routeTurnInput(agent: TurnInputTarget, message: unknown): 'steer' | 'followup';
