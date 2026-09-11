/**
 * dsh-kiro MCP manager. Reads `.kiro/settings/mcp.json` + `~/.kiro/settings/mcp.json`,
 * normalizes each entry into a typed server config, and exposes a status table
 * the runtime and `/mcp` command surface can render.
 *
 * Phase 4 ships the config reader + status table; phase 5 wires live stdio/SSE
 * spawning through `@modelcontextprotocol/sdk` once the runtime owns a process
 * boundary for each entry.
 *
 * @module @damomoashidamomo/dsh-kiro/mcp/manager
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Connection transport for an MCP server entry. */
export type McpTransport = 'stdio' | 'sse' | 'http'

/** Normalized MCP server configuration. */
export interface McpServerConfig {
  readonly name: string
  readonly transport: McpTransport
  readonly command?: string
  readonly args: readonly string[]
  readonly url?: string
  readonly env: Record<string, string>
  readonly source: 'project' | 'user'
  readonly path: string
}

/** Live runtime status of one MCP server. */
export interface McpServerStatus {
  readonly config: McpServerConfig
  /** Whether the manager has tried to start this server. */
  readonly started: boolean
  /** `ok` once a successful handshake completes. */
  readonly state: 'configured' | 'starting' | 'ok' | 'error'
  /** Tool names the server has advertised (once `started`). */
  readonly tools: readonly string[]
  /** Error message when `state === 'error'`. */
  readonly error?: string
}

interface RawMcpConfig {
  readonly mcpServers?: Record<string, unknown>
}

function normalizeTransport(value: unknown): McpTransport {
  if (value === 'sse' || value === 'http' || value === 'stdio') return value
  return 'stdio'
}

function loadConfigFile(path: string, source: 'project' | 'user'): McpServerConfig[] {
  if (!existsSync(path)) return []
  let raw: RawMcpConfig
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as RawMcpConfig
  } catch {
    return []
  }
  const servers = raw.mcpServers ?? {}
  const out: McpServerConfig[] = []
  for (const [name, value] of Object.entries(servers)) {
    if (typeof value !== 'object' || value === null) continue
    const entry = value as Record<string, unknown>
    const transport = normalizeTransport(entry['transport'])
    const command = typeof entry['command'] === 'string' ? entry['command'] : undefined
    const url = typeof entry['url'] === 'string' ? entry['url'] : undefined
    const args = Array.isArray(entry['args'])
      ? entry['args'].filter((arg): arg is string => typeof arg === 'string')
      : []
    const envRaw = entry['env']
    const env = typeof envRaw === 'object' && envRaw !== null
      ? Object.fromEntries(Object.entries(envRaw as Record<string, unknown>)
          .filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
      : {}
    out.push({
      name,
      transport,
      ...command !== undefined ? { command } : {},
      args,
      ...url !== undefined ? { url } : {},
      env,
      source,
      path,
    })
  }
  return out
}

/** Read every MCP server config from the well-known locations. */
export function loadMcpConfigs(): McpServerConfig[] {
  const candidates: ReadonlyArray<readonly ['project' | 'user', string]> = [
    ['project', join(process.cwd(), '.kiro', 'settings', 'mcp.json')],
    ['user', join(homedir(), '.kiro', 'settings', 'mcp.json')],
  ]
  const seen = new Set<string>()
  const out: McpServerConfig[] = []
  for (const [source, path] of candidates) {
    for (const cfg of loadConfigFile(path, source)) {
      // Project overrides user when names collide.
      const key = `${cfg.source}:${cfg.name}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(cfg)
    }
  }
  return out
}

/** Read-only manager exposed to the runtime and `/mcp` command. */
export class McpManager {
  private readonly statuses = new Map<string, McpServerStatus>()

  constructor() {
    for (const cfg of loadMcpConfigs()) {
      this.statuses.set(cfg.name, { config: cfg, started: false, state: 'configured', tools: [] })
    }
  }

  /** All known servers (including not-yet-started ones). */
  list(): readonly McpServerStatus[] {
    return [...this.statuses.values()]
  }

  /** Look up one server by name. */
  get(name: string): McpServerStatus | undefined {
    return this.statuses.get(name)
  }

  /** Mark a server as starting. */
  markStarting(name: string): void {
    const entry = this.statuses.get(name)
    if (entry === undefined) return
    this.statuses.set(name, { ...entry, started: true, state: 'starting' })
  }

  /** Mark a server as ok with the tool list advertised by the handshake. */
  markOk(name: string, tools: readonly string[]): void {
    const entry = this.statuses.get(name)
    if (entry === undefined) return
    this.statuses.set(name, { ...entry, state: 'ok', tools, error: undefined })
  }

  /** Mark a server as errored. */
  markError(name: string, error: string): void {
    const entry = this.statuses.get(name)
    if (entry === undefined) return
    this.statuses.set(name, { ...entry, state: 'error', error })
  }
}
