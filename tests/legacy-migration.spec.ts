import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeMigration, migrateLegacyKiro, migrateLegacyRoot } from '../src/migration/legacy-kiro'

/**
 * The one-time migration that moves dsh-kiro's own data out of the kiro-cli
 * directories. Contract under test:
 * - copies ONLY the items dsh-kiro owns (agents, bindings, skills, steering,
 *   hooks, approvals, trust, mcp, settings) — kiro-cli's own files (cli.json)
 *   are NOT carried over;
 * - the legacy directory is READ-ONLY to the migration: nothing written,
 *   nothing deleted, byte-identical afterwards;
 * - idempotent: the marker file makes a second pass a no-op;
 * - a missing legacy directory is a clean no-op.
 */

let root = ''
let legacyUser = ''
let legacyProject = ''
let userRoot = ''
let projectRoot = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-migration-'))
  legacyUser = join(root, 'home', '.kiro')
  legacyProject = join(root, 'ws', '.kiro')
  userRoot = join(root, 'home', '.dsh-kiro')
  projectRoot = join(root, 'ws', '.dsh-kiro')
  mkdirSync(legacyUser, { recursive: true })
  mkdirSync(legacyProject, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function fingerprint(dir: string): string {
  const lines: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const p = join(current, entry.name)
      if (entry.isDirectory()) walk(p)
      else lines.push(`${p}:${readFileSync(p, 'utf8')}`)
    }
  }
  try {
    walk(dir)
  } catch {
    return ''
  }
  return lines.sort().join('\n')
}

describe('legacy kiro migration', () => {
  it('copies dsh-kiro-owned files from both levels into the new roots', () => {
    writeFileSync(join(legacyUser, 'agent-engines.json'), '{"defaults":{"agent":"backend"}}')
    mkdirSync(join(legacyUser, 'agents'), { recursive: true })
    writeFileSync(join(legacyUser, 'agents', 'backend.json'), '{"name":"backend"}')
    mkdirSync(join(legacyUser, 'settings'), { recursive: true })
    writeFileSync(join(legacyUser, 'settings', 'trusted-tools.json'), '{"trustAll":true}')
    mkdirSync(join(legacyUser, 'skills', 'probe'), { recursive: true })
    writeFileSync(join(legacyUser, 'skills', 'probe', 'SKILL.md'), '---\nname: probe\n---\nbody')
    writeFileSync(join(legacyProject, 'skills.json'), '{"disabled":[]}')

    const result = migrateLegacyKiro({ userRoot, projectRoot, legacyUserRoot: legacyUser, legacyProjectRoot: legacyProject })
    expect(result.user.copied).toHaveLength(4)
    expect(result.project.copied).toHaveLength(1)
    expect(readFileSync(join(userRoot, 'agent-engines.json'), 'utf8')).toContain('backend')
    expect(readFileSync(join(userRoot, 'agents', 'backend.json'), 'utf8')).toContain('"backend"')
    expect(readFileSync(join(userRoot, 'settings', 'trusted-tools.json'), 'utf8')).toContain('trustAll')
    expect(existsSync(join(userRoot, 'skills', 'probe', 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(projectRoot, 'skills.json'), 'utf8')).toContain('disabled')
  })

  it('does NOT carry over kiro-cli-owned files (settings/cli.json)', () => {
    mkdirSync(join(legacyUser, 'settings'), { recursive: true })
    writeFileSync(join(legacyUser, 'settings', 'cli.json'), '{"chat":"kiro-cli stuff"}')
    writeFileSync(join(legacyUser, 'settings', 'trusted-tools.json'), '{"trustAll":false}')
    migrateLegacyRoot(legacyUser, userRoot)
    expect(existsSync(join(userRoot, 'settings', 'trusted-tools.json'))).toBe(true)
    expect(existsSync(join(userRoot, 'settings', 'cli.json'))).toBe(false)
  })

  it('leaves the legacy directory byte-identical (read-only contract)', () => {
    mkdirSync(join(legacyUser, 'agents'), { recursive: true })
    writeFileSync(join(legacyUser, 'agents', 'x.json'), '{"name":"x"}')
    writeFileSync(join(legacyUser, 'agent-engines.json'), '{}')
    const before = fingerprint(legacyUser)
    migrateLegacyRoot(legacyUser, userRoot)
    expect(fingerprint(legacyUser)).toBe(before)
  })

  it('is idempotent: the marker makes a second pass a no-op', () => {
    writeFileSync(join(legacyUser, 'agent-engines.json'), '{}')
    const first = migrateLegacyRoot(legacyUser, userRoot)
    expect(first.copied).toHaveLength(1)
    expect(existsSync(join(userRoot, 'migrated-legacy.json'))).toBe(true)
    const second = migrateLegacyRoot(legacyUser, userRoot)
    expect(second.copied).toHaveLength(0)
  })

  it('reruns stay consistent even if the marker could not be written', () => {
    // Simulate marker-less rerun (un writable root): existing targets are not
    // overwritten, so a user edit survives.
    writeFileSync(join(legacyUser, 'agent-engines.json'), '{"v":1}')
    migrateLegacyRoot(legacyUser, userRoot)
    writeFileSync(join(userRoot, 'agent-engines.json'), '{"v":"edited-by-user"}')
    unlinkSync(join(userRoot, 'migrated-legacy.json'))
    const again = migrateLegacyRoot(legacyUser, userRoot)
    expect(again.copied).toContain(join(legacyUser, 'agent-engines.json'))
    expect(readFileSync(join(userRoot, 'agent-engines.json'), 'utf8')).toContain('edited-by-user')
  })

  it('a missing legacy directory is a clean no-op', () => {
    const result = migrateLegacyKiro({
      userRoot, projectRoot,
      legacyUserRoot: join(root, 'nothing-here'),
      legacyProjectRoot: join(root, 'also-missing'),
    })
    expect(result.user.copied).toEqual([])
    expect(result.project.copied).toEqual([])
    expect(existsSync(userRoot)).toBe(false)
  })

  it('workspace agents identical to a user-level one are not copied twice', () => {
    // Same name + same content in both legacy levels: copying to both scopes
    // would list the agent twice in the /agent menu (and collide React keys).
    mkdirSync(join(legacyUser, 'agents'), { recursive: true })
    mkdirSync(join(legacyProject, 'agents'), { recursive: true })
    writeFileSync(join(legacyUser, 'agents', 'backend.json'), '{"name":"backend"}')
    writeFileSync(join(legacyProject, 'agents', 'backend.json'), '{"name":"backend"}')
    writeFileSync(join(legacyProject, 'agents', 'frontend.json'), '{"name":"frontend"}')

    migrateLegacyKiro({ userRoot, projectRoot, legacyUserRoot: legacyUser, legacyProjectRoot: legacyProject })
    expect(existsSync(join(userRoot, 'agents', 'backend.json'))).toBe(true)
    expect(existsSync(join(projectRoot, 'agents', 'backend.json'))).toBe(false, 'identical duplicate must be skipped')
    expect(existsSync(join(projectRoot, 'agents', 'frontend.json'))).toBe(true, 'workspace-only agent is kept')
  })

  it('workspace agent with DIFFERENT content than the user copy is kept (workspace wins)', () => {
    mkdirSync(join(legacyUser, 'agents'), { recursive: true })
    mkdirSync(join(legacyProject, 'agents'), { recursive: true })
    writeFileSync(join(legacyUser, 'agents', 'backend.json'), '{"name":"backend","prompt":"user version"}')
    writeFileSync(join(legacyProject, 'agents', 'backend.json'), '{"name":"backend","prompt":"workspace version"}')
    migrateLegacyKiro({ userRoot, projectRoot, legacyUserRoot: legacyUser, legacyProjectRoot: legacyProject })
    expect(existsSync(join(projectRoot, 'agents', 'backend.json'))).toBe(true)
    expect(readFileSync(join(projectRoot, 'agents', 'backend.json'), 'utf8')).toContain('workspace version')
  })

  it('runtime artifacts (loop-log, paste) are not migrated', () => {
    writeFileSync(join(legacyProject, 'loop-log.jsonl'), '{"event":{}}')
    mkdirSync(join(legacyProject, 'paste'), { recursive: true })
    writeFileSync(join(legacyProject, 'paste', 'paste-1.txt'), 'big paste')
    const result = migrateLegacyRoot(legacyProject, projectRoot)
    expect(result.copied).toEqual([])
    expect(existsSync(join(projectRoot, 'loop-log.jsonl'))).toBe(false)
  })

  it('describeMigration reports only when something was copied', () => {
    writeFileSync(join(legacyUser, 'agent-engines.json'), '{}')
    const results = migrateLegacyKiro({ userRoot, projectRoot, legacyUserRoot: legacyUser, legacyProjectRoot: legacyProject })
    const note = describeMigration(results)
    expect(note).toContain('1 项')
    expect(describeMigration({ user: { root: userRoot, copied: [], failed: [] }, project: { root: projectRoot, copied: [], failed: [] } })).toBeUndefined()
  })
})
