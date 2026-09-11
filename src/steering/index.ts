/**
 * kiro-steering — placeholder plugin. Phase 4 implements `.kiro/steering/*.md`
 * discovery with `always`/`conditional`/`manual` frontmatter and registers
 * each file as a system-prompt section.
 *
 * @module @damomoashidamomo/dsh-kiro/steering
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'kiro-steering'

/** Mount the placeholder plugin. */
export function apply(ctx: Context): void {
  ctx.logger.info?.('dsh-kiro: kiro-steering placeholder mounted; real loader ships in phase 4')
}
