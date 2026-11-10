import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TrustStore, readTrust, trustPath, writeTrust } from '../src/trust/store'

/**
 * Tool-trust store.
 *
 * IMPORTANT: the production path is `~/.kiro/settings/trusted-tools.json` —
 * inside the directory kiro-cli owns. These tests therefore NEVER use
 * `trustPath()` as a write target: every store is constructed with an explicit
 * path under a /tmp sandbox (an earlier version unlinked and rewrote the real
 * file on every run).
 */

let dir = ''
let file = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-trust-'))
  file = join(dir, '.kiro', 'settings', 'trusted-tools.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('trust store', () => {
  it('starts empty when the document is missing', () => {
    const store = new TrustStore(file)
    const snap = store.snapshot()
    expect(snap.trustAll).toBe(false)
    expect(snap.entries).toEqual({})
    expect(snap.version).toBe(1)
    expect(existsSync(file)).toBe(false)
  })

  it('trusts and untrusts individual tools', () => {
    const store = new TrustStore(file)
    expect(store.isTrusted('bash')).toBe(false)
    store.trust('bash')
    expect(store.isTrusted('bash')).toBe(true)
    store.untrust('bash')
    expect(store.isTrusted('bash')).toBe(false)
  })

  it('trust-all covers every tool', () => {
    const store = new TrustStore(file)
    store.trustAll()
    expect(store.isTrusted('bash')).toBe(true)
    expect(store.isTrusted('web')).toBe(true)
    expect(store.snapshot().trustAll).toBe(true)
  })

  it('reset returns to an empty document', () => {
    const store = new TrustStore(file)
    store.trust('bash')
    store.trustAll()
    store.reset()
    expect(store.snapshot().entries).toEqual({})
    expect(store.snapshot().trustAll).toBe(false)
  })

  it('persists to the configured file and reloads it', () => {
    const store = new TrustStore(file)
    store.trust('fs', 'always needed in tests')
    expect(existsSync(file)).toBe(true)
    const reloaded = new TrustStore(file)
    expect(reloaded.isTrusted('fs')).toBe(true)
    expect(reloaded.snapshot().entries['fs']?.reason).toBe('always needed in tests')
  })

  it('rejects empty/all trust names', () => {
    const store = new TrustStore(file)
    store.trust('')
    store.trust('all')
    expect(store.snapshot().entries).toEqual({})
  })

  it('writeTrust produces a v1 document at the given path', () => {
    writeTrust({ trustAll: false, entries: { x: { name: 'x', grantedAt: 1 } }, version: 1 }, file)
    expect(readTrust(file).entries['x']).toEqual({ name: 'x', grantedAt: 1 })
    const store = new TrustStore(file)
    expect(store.isTrusted('x')).toBe(true)
  })

  it('ignores a document with an unexpected version', () => {
    writeTrust({ trustAll: true, entries: {}, version: 1 }, file)
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    writeTrust({ ...raw, version: 99 } as never, file)
    expect(new TrustStore(file).snapshot().trustAll).toBe(false)
  })

  it('notifies subscribers on every change', () => {
    const store = new TrustStore(file)
    const events: string[] = []
    const off = store.subscribe((doc) => events.push(`${doc.entries['bash'] !== undefined ? 1 : 0}-${doc.trustAll ? 1 : 0}`))
    store.trust('bash')
    store.trustAll()
    expect(events.length).toBeGreaterThanOrEqual(2)
    off()
  })

  it('the production default still points at the kiro-cli-owned file', () => {
    // Documented on purpose: this is the one path tests must never write to.
    // The assertion only READS the resolved string (no filesystem access).
    expect(trustPath().endsWith(join('.kiro', 'settings', 'trusted-tools.json'))).toBe(true)
  })
})
