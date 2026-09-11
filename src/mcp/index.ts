/**
 * kiro-mcp — loads `.kiro/settings/mcp.json` + `~/.kiro/settings/mcp.json`,
 * normalizes each entry, and publishes a `McpManager` on the Cordis context
 * so the runtime and `/mcp` command can introspect server status.
 *
 * Phase 4 ships the manager + status table; phase 5 wires live stdio/SSE
 * spawning via `@modelcontextprotocol/sdk`.
 *
 * @module @damomoashidamomo/dsh-kiro/mcp
 */

import type { Context } from '@deepseek-ai/cordis'
import { McpManager } from './manager'

/** Service identifier for the loaded MCP manager. */
export const KIRO_MCP = 'kiroMcp'

/** Stable Cordis plugin name. */
export const name = 'kiro-mcp'

/** Mount the MCP manager. */
export function apply(ctx: Context): void {
  const manager = new McpManager()
  ctx.provide(KIRO_MCP, manager)
  ctx.logger.info?.(`dsh-kiro: kiro-mcp mounted (${manager.list().length} server(s) configured)`)
}

export { McpManager } from './manager'
export type { McpServerConfig, McpServerStatus, McpTransport } from './manager'
