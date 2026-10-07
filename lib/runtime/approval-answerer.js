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
/**
 * Build the waterfall listener. `next()` is never called: the TUI is a
 * terminal answerer, not a pass-through.
 */
export function createApprovalAnswerer(ui, feedback) {
    return async (req) => {
        if (ui.isToolAllowedForSession(req.toolName))
            return 'allowed-once';
        const choice = await ui.openApproval({ toolName: req.toolName, reason: req.reason }, req.signal);
        switch (choice.kind) {
            case 'allow-session':
                ui.allowToolForSession(req.toolName);
                return 'allowed-once';
            case 'deny':
                if (choice.reason !== undefined && choice.reason !== '') {
                    feedback.inject(`用户拒绝了 ${req.toolName} 的这次操作，理由：${choice.reason}。请调整方案，不要原样重试。`);
                }
                return 'rejected';
            case 'cancelled':
                return 'cancelled';
            case 'allow-once':
            default:
                return 'allowed-once';
        }
    };
}
//# sourceMappingURL=approval-answerer.js.map