/**
 * `/mcp` — list, add, remove, status. Phase 3 ships the listing surface
 * against `.kiro/settings/mcp.json` (read-only); the add/remove writers
 * land in phase 4 alongside the full MCP manager.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const mcpCommand: CommandDefinition;
