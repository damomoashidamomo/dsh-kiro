/**
 * kiro-checkpoint — placeholder plugin. Phase 5 implements a git shadow repo
 * under `.kiro/checkpoints/` and the `/checkpoint init|list|expand|diff|
 * restore|clean` workflow.
 *
 * @module @damomoashidamomo/dsh-kiro/checkpoint
 */
/** Stable Cordis plugin name. */
export const name = 'kiro-checkpoint';
/** Mount the placeholder plugin. */
export function apply(ctx) {
    ctx.logger.info?.('dsh-kiro: kiro-checkpoint placeholder mounted; real manager ships in phase 5');
}
//# sourceMappingURL=index.js.map