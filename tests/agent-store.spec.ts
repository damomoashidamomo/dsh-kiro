import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  agentDirs,
  agentTemplate,
  createAgent,
  deleteAgent,
  findAgent,
  listAgents,
  renameAgent,
  validateAgentFile,
} from '../src/utils/agent-store'

/**
 * `/agent create|rename|delete|validate` write real files. kiro-cli parity:
 * the template carries kiro's exact field set (prompt, tools ["*"],
 * allowedTools, toolAliases, …), project scope wins over user scope, and a
 * second agent with the same name cannot be created.
 */

let root = ''
let dirs: ReturnType<typeof agentDirs>

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-agents-'))
  dirs = { project: join(root, 'proj', '.dsh-kiro', 'agents'), user: join(root, 'user', '.dsh-kiro', 'agents') }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('agent store', () => {
  it('template matches the kiro-cli field set', () => {
    const doc = JSON.parse(agentTemplate('backend', '描述', null)) as Record<string, unknown>
    expect(Object.keys(doc)).toEqual(['name', 'description', 'prompt', 'mcpServers', 'tools', 'toolAliases', 'allowedTools', 'resources', 'hooks', 'toolsSettings', 'includeMcpJson', 'model'])
    expect(doc.tools).toEqual(['*'])
    expect(doc.prompt).toBeNull()
  })

  it('creates into the user dir and refuses duplicates', () => {
    const { path } = createAgent(dirs, 'backend', 'desc', 'You are a backend dev')
    expect(path).toBe(join(dirs.user, 'backend.json'))
    expect(existsSync(path)).toBe(true)
    expect(() => createAgent(dirs, 'backend')).toThrow(/已存在/u)
    const listed = listAgents(dirs)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ name: 'backend', source: 'user', description: 'desc' })
  })

  it('project scope wins when both define the same name', () => {
    mkdirSync(dirs.project, { recursive: true })
    mkdirSync(dirs.user, { recursive: true })
    writeFileSync(join(dirs.project, 'shared.json'), JSON.stringify({ name: 'shared', description: 'project copy' }))
    writeFileSync(join(dirs.user, 'shared.json'), JSON.stringify({ name: 'shared', description: 'user copy' }))
    expect(findAgent(dirs, 'shared')?.source).toBe('project')
    expect(listAgents(dirs)).toHaveLength(2) // both are listed, lookup prefers project
  })

  it('rename rewrites the name field and moves the file', () => {
    createAgent(dirs, 'old-name')
    const { path } = renameAgent(dirs, 'old-name', 'new-name')
    expect(path).toBe(join(dirs.user, 'new-name.json'))
    expect(existsSync(join(dirs.user, 'old-name.json'))).toBe(false)
    expect(findAgent(dirs, 'old-name')).toBeUndefined()
    expect(findAgent(dirs, 'new-name')?.name).toBe('new-name')
  })

  it('rename refuses a target that already exists', () => {
    createAgent(dirs, 'a')
    createAgent(dirs, 'b')
    expect(() => renameAgent(dirs, 'a', 'b')).toThrow(/已存在/u)
  })

  it('delete removes the file and reports missing names', () => {
    createAgent(dirs, 'doomed')
    const { path } = deleteAgent(dirs, 'doomed')
    expect(existsSync(path)).toBe(false)
    expect(() => deleteAgent(dirs, 'doomed')).toThrow(/no agent named/u)
  })

  it('validate accepts a good file and rejects bad JSON / missing name', () => {
    createAgent(dirs, 'fine')
    const good = validateAgentFile(join(dirs.user, 'fine.json'))
    expect(good).toEqual({ ok: true, name: 'fine' })
    const bad = join(root, 'bad.json')
    writeFileSync(bad, '{oops')
    expect(validateAgentFile(bad)).toMatchObject({ ok: false })
    const nameless = join(root, 'nameless.json')
    writeFileSync(nameless, JSON.stringify({ description: 'no name' }))
    expect(validateAgentFile(nameless)).toMatchObject({ ok: false })
  })
})

describe('renderAgentList', () => {
  it('marks the active preset and shows it in the header', async () => {
    const { renderAgentList } = await import('../src/commands/agent')
    const text = renderAgentList([
      { name: 'gary-test261104', description: 'test', source: 'project' },
      { name: 'testgary261106', description: '通用编码助手', source: 'user' },
    ], 'testgary261106')
    expect(text).toContain('2 custom agent(s)（当前：testgary261106）:')
    expect(text).toContain('[user] testgary261106 ◀ 当前  通用编码助手')
    expect(text).not.toContain('gary-test261104 ◀ 当前')
  })

  it('default (no preset) shows in the header without any marker', async () => {
    const { renderAgentList } = await import('../src/commands/agent')
    const text = renderAgentList([{ name: 'x', description: '', source: 'project' }], 'default')
    expect(text).toContain('（当前：default）')
    expect(text).not.toContain('◀ 当前')
  })
})
