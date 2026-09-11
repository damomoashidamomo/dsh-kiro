/**
 * `/mcp` — list, add, remove, status. Phase 3 ships the listing surface
 * against `.kiro/settings/mcp.json` (read-only); the add/remove writers
 * land in phase 4 alongside the full MCP manager.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface McpServerConfig {
  readonly name?: string
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  readonly env?: Record<string, string>
}

interface McpConfig {
  readonly mcpServers?: Record<string, McpServerConfig>
}

function loadConfig(): McpConfig {
  const candidates = [
    join(process.cwd(), '.kiro', 'settings', 'mcp.json'),
    join(homedir(), '.kiro', 'settings', 'mcp.json'),
  ]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as McpConfig
    } catch {
      /* fall through */
    }
  }
  return {}
}

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'list', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'list', args: tokens.slice(1) }
}

export const mcpCommand: CommandDefinition = {
  name: 'mcp',
  description: 'Manage MCP servers: list, add, remove, status',
  input: { hint: '<list|add|remove|status>' },
  handler: async ({ rawInput }) => {
    const { name: sub, args } = parseSubcommand(rawInput)
    switch (sub) {
      case 'list':
      case '': {
        const cfg = loadConfig()
        const servers = cfg.mcpServers ?? {}
        const names = Object.keys(servers)
        if (names.length === 0) {
          return {
            kind: 'success',
            text: 'no MCP servers configured. Create .kiro/settings/mcp.json or ~/.kiro/settings/mcp.json to add one.',
          }
        }
        const lines: string[] = [`${names.length.toString()} MCP server(s) configured:`]
        for (const [name, server] of Object.entries(servers)) {
          const transport = server.url !== undefined ? `url=${server.url}` : `cmd=${server.command ?? '?'}`
          lines.push(`  ${name.padEnd(20)} ${transport}`)
        }
        return { kind: 'success', text: lines.join('\n') }
      }
      case 'status':
        return { kind: 'success', text: 'live MCP status (started/stopped/error) lands in phase 4.' }
      case 'add':
      case 'remove':
      case 'import':
        return { kind: 'success', text: `/mcp ${sub} lands in phase 4.` }
      case 'help':
        return { kind: 'success', text: '/mcp <list|add|remove|status|import> [args]' }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /mcp help.` }
    }
  },
}
