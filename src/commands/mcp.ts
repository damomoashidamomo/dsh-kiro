import { stubCommand } from './stub'

export const mcpCommand = stubCommand(
  'mcp',
  'Manage MCP servers: list, add, remove, status',
  '<list|add|remove|status>',
)
