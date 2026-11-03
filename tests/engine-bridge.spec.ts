/**
 * Rust engine bridge (P2): spawn-per-call sandbox behavior against the real
 * binary. All file work happens inside a /tmp workspace; the escape probes
 * assert that the ENGINE cannot write outside its allowed roots — they
 * never actually write anywhere else.
 *
 * Skipped automatically when the binary is not built (pnpm build:engine).
 */

import { afterAll, describe, it, expect, beforeAll } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { engineBinary, runEngineCall, toEngineCall } from '../src/engine/bridge'

let workspace = ''

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'kiro-engine-spec-'))
  writeFileSync(join(workspace, 'note.txt'), 'ENGINE-SPEC-MARKER')
})

describe('rust engine bridge', () => {
  it('maps platform tool names onto the engine surface', () => {
    expect(toEngineCall('bash', { command: 'ls' })?.tool).toBe('execute_bash')
    expect(toEngineCall('execute_bash', {})?.tool).toBe('execute_bash')
    expect(toEngineCall('read', { path: 'a' })?.tool).toBe('fs_read')
    expect(toEngineCall('write', { path: 'a' })?.tool).toBe('fs_write')
    expect(toEngineCall('web_search', {})).toBeUndefined()
  })

  it('runs bash inside the sandboxed process', { timeout: 30000 }, async () => {
    if (engineBinary() === undefined) return
    const reply = await runEngineCall(
      { tool: 'execute_bash', args: { command: 'cat note.txt' } },
      workspace,
    )
    expect(reply.ok).toBe(true)
    expect(String(reply.result?.stdout)).toContain('ENGINE-SPEC-MARKER')
  })

  it('refuses writes outside the allowed roots', { timeout: 30000 }, async () => {
    if (engineBinary() === undefined) return
    const escape = join(tmpdir(), `kiro-engine-escape-${Date.now()}.txt`)
    const reply = await runEngineCall(
      { tool: 'fs_write', args: { path: escape, content: 'nope' } },
      workspace,
    )
    expect(reply.ok).toBe(false)
    expect(existsSync(escape)).toBe(false)
  })

  it('bash inside the engine is Landlock-confined (kernel denial)', { timeout: 30000 }, async () => {
    if (engineBinary() === undefined) return
    // /tmp is deliberately writable; the confinement probe targets $HOME,
    // where the kernel must DENY the write (nothing is ever created).
    const escape = join(homedir(), `.kiro-engine-deny-probe-${Date.now()}.txt`)
    const reply = await runEngineCall(
      { tool: 'execute_bash', args: { command: `touch ${escape}` } },
      workspace,
    )
    expect(reply.ok).toBe(true)
    expect(String(reply.result?.stderr)).toContain('Permission denied')
    expect(existsSync(escape)).toBe(false)
  })

  it('fs_read round-trips within the workspace', { timeout: 30000 }, async () => {
    if (engineBinary() === undefined) return
    const write = await runEngineCall(
      { tool: 'fs_write', args: { path: 'out/new.txt', content: 'made by spec', mode: 'create' } },
      workspace,
    )
    expect(write.ok).toBe(true)
    const read = await runEngineCall(
      { tool: 'fs_read', args: { path: 'out/new.txt' } },
      workspace,
    )
    expect(read.ok).toBe(true)
    expect(String(read.result?.content)).toBe('made by spec')
  })
})

afterAll?.(() => {
  try {
    rmSync(workspace, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
})
