/**
 * kiro-knowledge — placeholder plugin. Phase 5 implements a BM25 index (and
 * optional embedding) over `.kiro/knowledge/`, with `/knowledge add|show|
 * remove|update|clear|cancel` and the `knowledge` retrieval tool.
 *
 * @module @damomoashidamomo/dsh-kiro/knowledge
 */
/** Stable Cordis plugin name. */
export const name = 'kiro-knowledge';
/** Mount the placeholder plugin. */
export function apply(ctx) {
    ctx.logger.info?.('dsh-kiro: kiro-knowledge placeholder mounted; real index ships in phase 5');
}
//# sourceMappingURL=index.js.map