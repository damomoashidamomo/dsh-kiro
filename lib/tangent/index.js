/**
 * kiro-tangent — placeholder plugin. Phase 5 implements the tangent mode
 * (`/tangent`, Ctrl+T) — isolated side conversations that can be merged back
 * into the main context with `/tangent tail` or selectively dropped with
 * `/tangent forget [N]`.
 *
 * @module @damomoashidamomo/dsh-kiro/tangent
 */
/** Stable Cordis plugin name. */
export const name = 'kiro-tangent';
/** Mount the placeholder plugin. */
export function apply(ctx) {
    ctx.logger.info?.('dsh-kiro: kiro-tangent placeholder mounted; real mode ships in phase 5');
}
//# sourceMappingURL=index.js.map