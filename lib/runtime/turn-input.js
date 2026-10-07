/**
 * Routing for plain-text submissions: a running turn makes the message a
 * mid-flight steering input (consumed at the next step boundary of the LIVE
 * turn — the platform's `agent.steer()`), otherwise it opens a new turn via
 * `agent.followup()`. Extracted so the branch is unit-testable without
 * booting the whole runtime.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/turn-input
 */
/**
 * Deliver one user message to the agent. Returns which path was taken so the
 * caller can render the matching feedback line.
 */
export function routeTurnInput(agent, message) {
    if (agent.status === 'running') {
        agent.steer(message);
        return 'steer';
    }
    agent.followup(message);
    return 'followup';
}
//# sourceMappingURL=turn-input.js.map