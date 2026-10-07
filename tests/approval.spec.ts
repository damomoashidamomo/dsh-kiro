import { describe, it, expect, vi } from 'vitest'
import { SessionController } from '../src/runtime/session-controller'
import { createApprovalAnswerer } from '../src/runtime/approval-answerer'

describe('SessionController approval panel', () => {
  it('openApproval publishes state and resolves on resolveApproval', async () => {
    const ctrl = new SessionController()
    const promise = ctrl.openApproval({ toolName: 'bash', reason: 'escalate sandbox' })
    expect(ctrl.getState().approval).toEqual({ toolName: 'bash', reason: 'escalate sandbox' })
    ctrl.resolveApproval({ kind: 'allow-once' })
    await expect(promise).resolves.toEqual({ kind: 'allow-once' })
    expect(ctrl.getState().approval).toBeUndefined()
  })

  it('cancelApproval resolves cancelled and closes the panel', async () => {
    const ctrl = new SessionController()
    const promise = ctrl.openApproval({ toolName: 'bash', reason: undefined })
    ctrl.cancelApproval()
    await expect(promise).resolves.toEqual({ kind: 'cancelled' })
    expect(ctrl.getState().approval).toBeUndefined()
  })

  it('resolves cancelled when the request signal is already aborted', async () => {
    const ctrl = new SessionController()
    const signal = {
      aborted: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    await expect(ctrl.openApproval({ toolName: 'bash', reason: undefined }, signal))
      .resolves.toEqual({ kind: 'cancelled' })
    expect(ctrl.getState().approval).toBeUndefined()
    expect(signal.addEventListener).not.toHaveBeenCalled()
  })

  it('signal abort mid-flight cancels the pending question', async () => {
    const ctrl = new SessionController()
    const listeners: Array<() => void> = []
    const signal = {
      aborted: false,
      addEventListener: (_t: string, l: () => void) => { listeners.push(l) },
      removeEventListener: vi.fn(),
    }
    const promise = ctrl.openApproval({ toolName: 'bash', reason: undefined }, signal)
    listeners[0]!()
    await expect(promise).resolves.toEqual({ kind: 'cancelled' })
    expect(ctrl.getState().approval).toBeUndefined()
  })

  it('session-wide allowance is remembered per tool', () => {
    const ctrl = new SessionController()
    expect(ctrl.isToolAllowedForSession('bash')).toBe(false)
    ctrl.allowToolForSession('bash')
    expect(ctrl.isToolAllowedForSession('bash')).toBe(true)
    expect(ctrl.isToolAllowedForSession('write_file')).toBe(false)
  })

  it('turn/end withdraws a pending approval', async () => {
    const ctrl = new SessionController()
    const handlers = new Map<string, (session: unknown, event: unknown) => void>()
    const ctx = {
      on: (type: string, cb: (session: unknown, event: unknown) => void) => {
        handlers.set(type, cb)
        return () => handlers.delete(type)
      },
    }
    const session = { id: 's1' }
    ctrl.bindAgent(ctx as never, { session } as never)
    const promise = ctrl.openApproval({ toolName: 'bash', reason: undefined })
    handlers.get('session/event')?.(session, {
      type: 'turn/end',
      seq: 1,
      data: { turn: 1, reason: { kind: 'completed' } },
    })
    await expect(promise).resolves.toEqual({ kind: 'cancelled' })
  })
})

describe('approval answerer', () => {
  function setup() {
    const ctrl = new SessionController()
    const inject = vi.fn()
    const answer = createApprovalAnswerer(ctrl, { inject })
    return { ctrl, inject, answer }
  }

  it('answers allowed-once without remembering', async () => {
    const { ctrl, answer } = setup()
    const pending = answer({ toolName: 'bash', reason: 'why' })
    expect(ctrl.getState().approval).toEqual({ toolName: 'bash', reason: 'why' })
    ctrl.resolveApproval({ kind: 'allow-once' })
    await expect(pending).resolves.toBe('allowed-once')
    expect(ctrl.isToolAllowedForSession('bash')).toBe(false)
  })

  it('allow-session answers allowed-once and skips later asks', async () => {
    const { ctrl, answer } = setup()
    const first = answer({ toolName: 'bash' })
    ctrl.resolveApproval({ kind: 'allow-session' })
    await expect(first).resolves.toBe('allowed-once')
    expect(ctrl.isToolAllowedForSession('bash')).toBe(true)
    // Second ask never opens a panel.
    const second = await answer({ toolName: 'bash' })
    expect(second).toBe('allowed-once')
    expect(ctrl.getState().approval).toBeUndefined()
  })

  it('deny with reason rejects and injects user feedback', async () => {
    const { ctrl, inject, answer } = setup()
    const pending = answer({ toolName: 'bash', reason: 'escalate sandbox' })
    ctrl.resolveApproval({ kind: 'deny', reason: '别动系统文件' })
    await expect(pending).resolves.toBe('rejected')
    expect(inject).toHaveBeenCalledWith(expect.stringContaining('别动系统文件'))
  })

  it('deny without reason rejects silently', async () => {
    const { ctrl, inject, answer } = setup()
    const pending = answer({ toolName: 'bash', reason: undefined })
    ctrl.resolveApproval({ kind: 'deny', reason: undefined })
    await expect(pending).resolves.toBe('rejected')
    expect(inject).not.toHaveBeenCalled()
  })

  it('signal-cancelled request returns cancelled', async () => {
    const { ctrl, answer } = setup()
    const listeners: Array<() => void> = []
    const pending = answer({
      toolName: 'bash',
      signal: {
        aborted: false,
        addEventListener: (_t: string, l: () => void) => { listeners.push(l) },
        removeEventListener: vi.fn(),
      },
    })
    listeners[0]!()
    await expect(pending).resolves.toBe('cancelled')
  })
})
