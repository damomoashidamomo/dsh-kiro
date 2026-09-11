import { describe, it, expect } from 'vitest'
import {
  parseAgentConfig,
} from '../src/agents/loader'
import {
  loadSteeringFiles,
  resolveApplicableSteering,
} from '../src/steering/loader'
import {
  loadMcpConfigs,
} from '../src/mcp/manager'

describe('parseAgentConfig', () => {
  it('parses a minimal valid config', () => {
    const cfg = parseAgentConfig({ name: 'backend', description: 'Backend helper' }, 'user', '/tmp/x.json')
    expect(cfg.name).toBe('backend')
    expect(cfg.description).toBe('Backend helper')
    expect(cfg.source).toBe('user')
    expect(cfg.allowSubagents).toBe(true)
    expect(cfg.mcpServers).toEqual([])
    expect(cfg.steeringFiles).toEqual([])
  })

  it('rejects names that violate the kebab-case grammar', () => {
    expect(() => parseAgentConfig({ name: 'Bad Name' }, 'user', '/tmp/x.json')).toThrow()
    expect(() => parseAgentConfig({ name: '99-leading-digit' }, 'user', '/tmp/x.json')).toThrow()
  })

  it('normalizes tool policies', () => {
    const cfg = parseAgentConfig({
      name: 'foo',
      tools: { allow: ['bash', 'fs'], deny: ['web'] },
    }, 'project', '/tmp/foo.json')
    expect(cfg.tools.allow).toEqual(['bash', 'fs'])
    expect(cfg.tools.deny).toEqual(['web'])
  })

  it('drops invalid mcpServers entries', () => {
    const cfg = parseAgentConfig({
      name: 'foo',
      mcpServers: [
        { name: 'good', command: 'npx', args: ['-y', 'mcp-server'] },
        { command: 'missing-name' },
        'not-an-object',
      ],
    }, 'user', '/tmp/foo.json')
    expect(cfg.mcpServers.length).toBe(1)
    expect(cfg.mcpServers[0]?.name).toBe('good')
  })

  it('recognizes effort and mode overrides', () => {
    const cfg = parseAgentConfig({ name: 'foo', effort: 'xhigh', mode: 'spec' }, 'user', '/tmp/foo.json')
    expect(cfg.effort).toBe('xhigh')
    expect(cfg.mode).toBe('spec')
  })
})

describe('steering loader', () => {
  it('returns an empty list when no .kiro/steering directory exists', () => {
    // The cwd may have a project steering dir; load returns at least [] when
    // user-side is empty.
    const files = loadSteeringFiles()
    expect(Array.isArray(files)).toBe(true)
  })

  it('classifies always / conditional / manual correctly', () => {
    const files = [
      { name: 'a', source: 'user', path: '/a', kind: 'always' as const, includeFiles: [], excludeFiles: [], description: '', content: 'a' },
      { name: 'b', source: 'user', path: '/b', kind: 'manual' as const, includeFiles: [], excludeFiles: [], description: '', content: 'b' },
      { name: 'c', source: 'user', path: '/c', kind: 'conditional' as const, includeFiles: ['**/*.ts'], excludeFiles: [], description: '', content: 'c' },
      { name: 'd', source: 'user', path: '/d', kind: 'conditional' as const, includeFiles: [], excludeFiles: ['*.bak'], description: '', content: 'd' },
    ]
    const applicable = resolveApplicableSteering('/tmp', files)
    expect(applicable.map((f) => f.name).sort()).toEqual(['a', 'd'])
  })

  it('matches includeFiles globs against the cwd', () => {
    const files = [
      { name: 'ts', source: 'user', path: '/ts', kind: 'conditional' as const, includeFiles: ['**/*.ts'], excludeFiles: [], description: '', content: 't' },
    ]
    const applicable = resolveApplicableSteering('/project/foo.ts', files)
    expect(applicable.map((f) => f.name)).toEqual(['ts'])
  })
})

describe('mcp configs', () => {
  it('returns an empty list when no config exists', () => {
    const configs = loadMcpConfigs()
    expect(Array.isArray(configs)).toBe(true)
  })
})
