/**
 * kiro-agents — placeholder plugin so the bundle resolves end-to-end. Phase 4
 * implements `.kiro/agents/*.json` + `~/.kiro/agents/*.json` discovery and
 * registers each one as an agent preset.
 *
 * @module @damomoashidamomo/dsh-kiro/agents
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'kiro-agents'

/** Mount the placeholder plugin. */
export function apply(ctx: Context): void {
  ctx.logger.info?.('dsh-kiro: kiro-agents placeholder mounted; real loader ships in phase 4')
}
