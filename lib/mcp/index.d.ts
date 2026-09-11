/**
 * kiro-mcp — placeholder plugin. Phase 4 implements MCP server discovery via
 * `.kiro/settings/mcp.json` + `~/.kiro/settings/mcp.json` and exposes each
 * server's tools under the `@server/tool` namespace.
 *
 * @module @damomoashidamomo/dsh-kiro/mcp
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-mcp";
/** Mount the placeholder plugin. */
export declare function apply(ctx: Context): void;
