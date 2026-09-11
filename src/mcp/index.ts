/**
 * kiro-mcp — placeholder plugin. Phase 4 implements MCP server discovery via
 * `.kiro/settings/mcp.json` + `~/.kiro/settings/mcp.json` and exposes each
 * server's tools under the `@server/tool` namespace.
 *
 * @module @damomoashidamomo/dsh-kiro/mcp
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'kiro-mcp'

/** Mount the placeholder plugin. */
export function apply(ctx: Context): void {
  ctx.logger.info?.('dsh-kiro: kiro-mcp placeholder mounted; real manager ships in phase 4')
}
