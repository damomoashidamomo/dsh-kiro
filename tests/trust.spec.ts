import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, unlinkSync } from 'node:fs'
import { trustPath, TrustStore, writeTrust } from '../src/trust/store'

describe('trust store', () => {
  beforeEach(() => {
    const path = trustPath()
    if (existsSync(path)) unlinkSync(path)
  })

  it('starts empty when the document is missing', () => {
    const store = new TrustStore()
    const snap = store.snapshot()
    expect(snap.trustAll).toBe(false)
    expect(snap.entries).toEqual({})
    expect(snap.version).toBe(1)
  })

  it('trusts and untrusts individual tools', () => {
    const store = new TrustStore()
    expect(store.isTrusted('bash')).toBe(false)
    store.trust('bash')
    expect(store.isTrusted('bash')).toBe(true)
    store.untrust('bash')
    expect(store.isTrusted('bash')).toBe(false)
  })

  it('trust-all covers every tool', () => {
    const store = new TrustStore()
    store.trustAll()
    expect(store.isTrusted('bash')).toBe(true)
    expect(store.isTrusted('web')).toBe(true)
    expect(store.snapshot().trustAll).toBe(true)
  })

  it('reset returns to an empty document', () => {
    const store = new TrustStore()
    store.trust('bash')
    store.trustAll()
    store.reset()
    expect(store.snapshot().entries).toEqual({})
    expect(store.snapshot().trustAll).toBe(false)
  })

  it('persists to ~/.kiro/settings/trusted-tools.json', () => {
    const store = new TrustStore()
    store.trust('fs', 'always needed in tests')
    expect(existsSync(trustPath())).toBe(true)
    const reloaded = new TrustStore()
    expect(reloaded.isTrusted('fs')).toBe(true)
  })

  it('rejects empty/all trust names', () => {
    const store = new TrustStore()
    store.trust('')
    store.trust('all')
    expect(store.snapshot().entries).toEqual({})
  })

  it('writeTrust produces a v1 document', () => {
    writeTrust({ trustAll: false, entries: { x: { name: 'x', grantedAt: 1 } }, version: 1 })
    const reloaded = new TrustStore()
    expect(reloaded.isTrusted('x')).toBe(true)
  })

  it('notifies subscribers on every change', () => {
    const store = new TrustStore()
    const events: string[] = []
    const off = store.subscribe((doc) => events.push(`${doc.entries['bash'] !== undefined ? 1 : 0}-${doc.trustAll ? 1 : 0}`))
    store.trust('bash')
    store.trustAll()
    expect(events.length).toBeGreaterThanOrEqual(2)
    off()
  })
})
