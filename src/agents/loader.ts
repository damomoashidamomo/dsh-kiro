/**
 * dsh-kiro custom-agents loader. Reads `.kiro/agents/*.json` and
 * `~/.kiro/agents/*.json`, validates each against the kiro agent schema, and
 * exposes them through a registry the runtime can consult.
 *
 * @module @damomoashidamomo/dsh-kiro/agents/loader
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

/** Source location of an agent config. */
export type AgentSource = 'project' | 'user'

/** Allowed/denied tool lists. */
export interface AgentToolPolicy {
  readonly allow?: readonly string[]
  readonly deny?: readonly string[]
}

/** MCP server entry embedded in an agent config. */
export interface AgentMcpServer {
  readonly name: string
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  readonly env?: Record<string, string>
}

/** Resolved custom-agent record. */
export interface AgentConfig {
  readonly name: string
  readonly description: string
  readonly source: AgentSource
  readonly path: string
  /** Provider/model the agent selects by default. */
  readonly model?: string
  /** System prompt the agent mounts. */
  readonly systemPrompt?: string
  /** Tool allow/deny list. */
  readonly tools: AgentToolPolicy
  /** Steering files to inject. */
  readonly steeringFiles: readonly string[]
  /** MCP servers required by this agent. */
  readonly mcpServers: readonly AgentMcpServer[]
  /** Whether the agent can spawn subagents. */
  readonly allowSubagents: boolean
  /** Reasoning-effort override. */
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Mode override. */
  readonly mode?: 'vibe' | 'spec'
  /** Free-form extras preserved for the runtime to interpret. */
  readonly raw: Record<string, unknown>
}

const VALID_NAME = /^[a-z][a-z0-9_-]*$/u

function parseToolPolicy(value: unknown): AgentToolPolicy {
  if (typeof value !== 'object' || value === null) return {}
  const policy = value as { allow?: unknown; deny?: unknown }
  const allow = Array.isArray(policy.allow)
    ? policy.allow.filter((entry): entry is string => typeof entry === 'string')
    : undefined
  const deny = Array.isArray(policy.deny)
    ? policy.deny.filter((entry): entry is string => typeof entry === 'string')
    : undefined
  return {
    ...allow !== undefined ? { allow } : {},
    ...deny !== undefined ? { deny } : {},
  }
}

function parseMcpServers(value: unknown): AgentMcpServer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): AgentMcpServer[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const item = entry as Record<string, unknown>
    const name = item['name']
    if (typeof name !== 'string') return []
    const command = typeof item['command'] === 'string' ? item['command'] : undefined
    const url = typeof item['url'] === 'string' ? item['url'] : undefined
    const args = Array.isArray(item['args'])
      ? item['args'].filter((arg): arg is string => typeof arg === 'string')
      : undefined
    const envRaw = item['env']
    const env = typeof envRaw === 'object' && envRaw !== null
      ? Object.fromEntries(Object.entries(envRaw as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : undefined
    return [{
      name,
      ...command !== undefined ? { command } : {},
      ...url !== undefined ? { url } : {},
      ...args !== undefined ? { args } : {},
      ...env !== undefined ? { env } : {},
    }]
  })
}

/** Parse and validate one agent config object. Throws on invalid input. */
export function parseAgentConfig(raw: unknown, source: AgentSource, path: string): AgentConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError(`agent config at ${path} is not an object`)
  }
  const data = raw as Record<string, unknown>
  const name = typeof data['name'] === 'string' ? data['name'] : basename(path, '.json')
  if (!VALID_NAME.test(name)) {
    throw new Error(`agent config at ${path}: invalid name "${name}" (must match ${String(VALID_NAME)})`)
  }
  const description = typeof data['description'] === 'string' ? data['description'] : ''
  const model = typeof data['model'] === 'string' ? data['model'] : undefined
  const systemPrompt = typeof data['systemPrompt'] === 'string' ? data['systemPrompt'] : undefined
  const tools = parseToolPolicy(data['tools'])
  const steeringRaw = data['steeringFiles']
  const steeringFiles = Array.isArray(steeringRaw)
    ? steeringRaw.filter((entry): entry is string => typeof entry === 'string')
    : []
  const mcpServers = parseMcpServers(data['mcpServers'])
  const allowSubagents = data['allowSubagents'] !== false
  const effortRaw = data['effort']
  const effort = (effortRaw === 'low' || effortRaw === 'medium' || effortRaw === 'high' || effortRaw === 'xhigh' || effortRaw === 'max')
    ? effortRaw
    : undefined
  const modeRaw = data['mode']
  const mode = modeRaw === 'vibe' || modeRaw === 'spec' ? modeRaw : undefined
  return {
    name,
    description,
    source,
    path,
    ...model !== undefined ? { model } : {},
    ...systemPrompt !== undefined ? { systemPrompt } : {},
    tools,
    steeringFiles,
    mcpServers,
    allowSubagents,
    ...effort !== undefined ? { effort } : {},
    ...mode !== undefined ? { mode } : {},
    raw: data,
  }
}

/** Walk the well-known agent directories and parse every JSON file. */
export function loadAgentConfigs(): AgentConfig[] {
  const sources: ReadonlyArray<readonly [AgentSource, string]> = [
    ['project', join(process.cwd(), '.kiro', 'agents')],
    ['user', join(homedir(), '.kiro', 'agents')],
  ]
  const out: AgentConfig[] = []
  for (const [source, dir] of sources) {
    if (!existsSync(dir)) continue
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const path = join(dir, entry)
      if (!statSync(path).isFile()) continue
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(path, 'utf8'))
      } catch (error: unknown) {
        continue
      }
      try {
        out.push(parseAgentConfig(raw, source, path))
      } catch {
        continue
      }
    }
  }
  return out
}
