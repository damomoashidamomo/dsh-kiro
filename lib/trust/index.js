/**
 * kiro-trust — placeholder plugin. Phase 3 implements the per-tool trust
 * store backed by `~/.kiro/settings/trusted-tools.json`, with interception
 * via `agent/pre-step` and the ApprovalOverlay flow.
 *
 * @module @damomoashidamomo/dsh-kiro/trust
 */
/** Stable Cordis plugin name. */
export const name = 'kiro-trust';
/** Mount the placeholder plugin. */
export function apply(ctx) {
    ctx.logger.info?.('dsh-kiro: kiro-trust placeholder mounted; real enforcement ships in phase 3');
}
//# sourceMappingURL=index.js.map