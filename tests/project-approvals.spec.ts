import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import type { SessionController } from '../src/runtime/session-controller'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'kiro-approvals-'))
const realCwd = process.cwd()

beforeEach(() => {
  process.chdir(dir)
})
afterEach(() => {
  process.chdir(realCwd)
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('.kiro/approvals.json store', () => {
  it('allow-project writes the tool list and a fresh controller seeds from it', async () => {
    const { SessionController } = await import('../src/runtime/session-controller')
    const ctrl = new SessionController()
    expect(ctrl.isToolAllowedForSession('edit')).toBe(false)
    ctrl.allowToolForProject('edit')
    expect(ctrl.isToolAllowedForSession('edit')).toBe(true)
    const file = join(dir, '.kiro', 'approvals.json')
    expect(existsSync(file)).toBe(true)
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { tools: string[] }
    expect(parsed.tools).toEqual(['edit'])
    // A NEW controller (next boot) seeds the session set from the file.
    const next = new SessionController()
    expect(next.isToolAllowedForSession('edit')).toBe(true)
    expect(next.isToolAllowedForSession('bash')).toBe(false)
  })

  it('session-only allowance does not touch the file', async () => {
    mkdirSync(join(dir, '.kiro'), { recursive: true })
    writeFileSync(join(dir, '.kiro', 'approvals.json'), JSON.stringify({ tools: ['write'] }))
    const { SessionController } = await import('../src/runtime/session-controller')
    const ctrl = new SessionController()
    ctrl.allowToolForSession('bash')
    const parsed = JSON.parse(readFileSync(join(dir, '.kiro', 'approvals.json'), 'utf8')) as { tools: string[] }
    expect(parsed.tools).toEqual(['write'])
    expect(ctrl.isToolAllowedForSession('bash')).toBe(true)
  })
})


describe('pattern trust (v2 store)', () => {
  it('allow-project with prefix persists a pattern that auto-allows matches', async () => {
    const { SessionController } = await import('../src/runtime/session-controller')
    const ctrl: SessionController = new SessionController()
    ctrl.allowPatternForProject({ tool: 'bash', prefix: 'grep ' })
    const file = join(dir, '.kiro', 'approvals.json')
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { tools: string[]; patterns: { tool: string; prefix: string }[] }
    expect(parsed.patterns).toEqual([{ tool: 'bash', prefix: 'grep ' }])
    // A new boot auto-allows matching commands, not others.
    const next = new SessionController() as SessionController
    expect(next.matchesTrustPattern('bash', JSON.stringify({ command: 'grep -n foo bar.txt' }))).toBe(true)
    expect(next.matchesTrustPattern('bash', JSON.stringify({ command: 'rm -rf /' }))).toBe(false)
    // listing + removal round-trip (removeTrustEntry takes a 0-based index)
    const listing = next.trustListing()
    expect(listing.projectPatterns.length).toBe(1)
    expect(next.removeTrustEntry('project-pattern', 0)).toBe(true)
    expect(next.trustListing().projectPatterns.length).toBe(0)
  })

  it('session-scoped patterns work without persisting', async () => {
    const { SessionController } = await import('../src/runtime/session-controller')
    const ctrl = new SessionController() as SessionController
    ctrl.allowPatternForSession({ tool: 'bash', prefix: 'kubectl ' })
    expect(ctrl.matchesTrustPattern('bash', JSON.stringify({ command: 'kubectl get pods' }))).toBe(true)
    const fresh = new SessionController() as SessionController
    expect(fresh.matchesTrustPattern('bash', JSON.stringify({ command: 'kubectl get pods' }))).toBe(false)
  })
})
