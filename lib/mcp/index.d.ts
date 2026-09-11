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
import type { Context } from '@deepseek-ai/cordis';
/** Service identifier for the loaded MCP manager. */
export declare const KIRO_MCP = "kiroMcp";
/** Stable Cordis plugin name. */
export declare const name = "kiro-mcp";
/** Mount the MCP manager. */
export declare function apply(ctx: Context): void;
export { McpManager } from './manager';
export type { McpServerConfig, McpServerStatus, McpTransport } from './manager';
