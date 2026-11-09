/**
 * Custom-agent store — the `.kiro/agents/*.json` files kiro-cli reads.
 *
 * Project scope wins over user scope, the same precedence kiro-cli uses. The
 * write operations (create / rename / delete / validate) live here as pure
 * functions over a pair of directories so tests can run against a temp tree
 * instead of the user's `~/.kiro/agents`.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/agent-store
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

/** Project dir first, user dir second — lookup order matters. */
export function agentDirs(cwd = process.cwd(), home = homedir()): { project: string; user: string } {
  return { project: join(cwd, '.kiro', 'agents'), user: join(home, '.kiro', 'agents') }
}

export interface AgentSummary {
  readonly name: string
  readonly source: 'project' | 'user'
  readonly path: string
  readonly description: string
}

/** List every agent definition, project scope first. */
export function listAgents(dirs = agentDirs()): AgentSummary[] {
  const out: AgentSummary[] = []
  for (const [source, dir] of [['project', dirs.project], ['user', dirs.user]] as const) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) continue
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as { name?: string; description?: string }
        out.push({
          name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : basename(entry, '.json'),
          source,
          path,
          description: typeof raw.description === 'string' ? raw.description : '',
        })
      } catch {
        out.push({ name: basename(entry, '.json'), source, path, description: '(invalid JSON)' })
      }
    }
  }
  return out
}

/** The file an agent name lives in, or undefined. Project scope wins. */
export function findAgent(dirs: ReturnType<typeof agentDirs>, name: string): AgentSummary | undefined {
  return listAgents(dirs).find((agent) => agent.name === name)
}

/** The kiro-shaped template a new agent starts from (kiro-cli field parity). */
export function agentTemplate(name: string, description: string, prompt: string | null): string {
  return `${JSON.stringify({
    name,
    description,
    prompt,
    mcpServers: {},
    tools: ['*'],
    toolAliases: {},
    allowedTools: [],
    resources: [],
    hooks: {},
    toolsSettings: {},
    includeMcpJson: false,
    model: null,
  }, null, 2)}\n`
}

/** Create `<user-dir>/<name>.json` from the template; refuses an existing file. */
export function createAgent(
  dirs: ReturnType<typeof agentDirs>,
  name: string,
  description = '',
  prompt: string | null = null,
): { path: string } {
  const target = join(dirs.user, `${name}.json`) // kiro saves to the global dir
  if (existsSync(target)) throw new Error(`已存在 ${target}`)
  mkdirSync(dirs.user, { recursive: true })
  writeFileSync(target, agentTemplate(name, description, prompt), 'utf8')
  return { path: target }
}

/** Rename: rewrite the file's `name` field and move it. */
export function renameAgent(
  dirs: ReturnType<typeof agentDirs>,
  from: string,
  to: string,
): { path: string } {
  const match = findAgent(dirs, from)
  if (match === undefined) throw new Error(`no agent named "${from}"`)
  const next = join(match.path, '..', `${to}.json`)
  if (existsSync(next)) throw new Error(`已存在 ${next}`)
  let preset: Record<string, unknown> = {}
  try {
    preset = JSON.parse(readFileSync(match.path, 'utf8')) as Record<string, unknown>
  } catch {
    // A broken file still renames; validate will report the damage.
  }
  preset['name'] = to
  writeFileSync(next, `${JSON.stringify(preset, null, 2)}\n`, 'utf8')
  if (next !== match.path) rmSync(match.path)
  return { path: next }
}

/** Delete an agent definition file. */
export function deleteAgent(dirs: ReturnType<typeof agentDirs>, name: string): { path: string } {
  const match = findAgent(dirs, name)
  if (match === undefined) throw new Error(`no agent named "${name}"`)
  rmSync(match.path)
  return { path: match.path }
}

/** A definition is valid when it parses and carries a non-empty name. */
export function validateAgentFile(path: string): { ok: true; name: string } | { ok: false; reason: string } {
  let parsed: { name?: unknown }
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown }
  } catch (error) {
    return { ok: false, reason: `不是合法 JSON：${error instanceof Error ? error.message : String(error)}` }
  }
  if (typeof parsed.name !== 'string' || parsed.name === '') {
    return { ok: false, reason: '缺少 name 字段' }
  }
  return { ok: true, name: parsed.name }
}

/** 引擎绑定（dsh-kiro 私有，存工作区 `.kiro/agent-engines.json`）。 */
export interface EngineBinding {
  readonly engine: 'kiro' | 'dsh'
  readonly toolEngine?: 'rust' | 'dsh'
}

interface AgentEnginesFile {
  bindings?: Record<string, { engine?: string; toolEngine?: string }>
  defaults?: { agent?: string }
}

function enginesFilePath(cwd: string): string {
  return join(cwd, '.kiro', 'agent-engines.json')
}

function readEnginesFile(cwd: string): AgentEnginesFile {
  try {
    const parsed = JSON.parse(readFileSync(enginesFilePath(cwd), 'utf8')) as AgentEnginesFile
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeEnginesFile(cwd: string, doc: AgentEnginesFile): void {
  mkdirSync(join(cwd, '.kiro'), { recursive: true })
  writeFileSync(enginesFilePath(cwd), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
}

/** 某 agent 的引擎绑定；未绑定返回 undefined（沿用当前引擎）。 */
export function getEngineBinding(cwd: string, name: string): EngineBinding | undefined {
  const binding = readEnginesFile(cwd).bindings?.[name]
  if (binding === undefined || typeof binding !== 'object') return undefined
  const engine = binding.engine === 'kiro' || binding.engine === 'dsh' ? binding.engine : undefined
  if (engine === undefined) return undefined
  const toolEngine = binding.toolEngine === 'rust' ? 'rust' : binding.toolEngine === 'dsh' ? 'dsh' : undefined
  return { engine, toolEngine }
}

/** 写入/更新引擎绑定。 */
export function setEngineBinding(
  cwd: string,
  name: string,
  binding: EngineBinding,
): void {
  const doc = readEnginesFile(cwd)
  doc.bindings = { ...(doc.bindings ?? {}), [name]: { engine: binding.engine, ...(binding.toolEngine !== undefined ? { toolEngine: binding.toolEngine } : {}) } }
  writeEnginesFile(cwd, doc)
}

/** 清除某 agent 的引擎绑定。 */
export function clearEngineBinding(cwd: string, name: string): boolean {
  const doc = readEnginesFile(cwd)
  if (doc.bindings?.[name] === undefined) return false
  delete doc.bindings[name]
  writeEnginesFile(cwd, doc)
  return true
}

/** 启动默认 agent（`defaults.agent`），未设置返回 undefined。 */
export function getDefaultAgent(cwd: string): string | undefined {
  const agent = readEnginesFile(cwd).defaults?.agent
  return typeof agent === 'string' && agent.trim() !== '' ? agent : undefined
}

/** 设置启动默认 agent。 */
export function setDefaultAgent(cwd: string, name: string): void {
  const doc = readEnginesFile(cwd)
  doc.defaults = { ...(doc.defaults ?? {}), agent: name }
  writeEnginesFile(cwd, doc)
}
