import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
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
