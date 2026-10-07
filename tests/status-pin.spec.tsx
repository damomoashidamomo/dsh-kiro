import { describe, it, expect } from 'vitest'
import { SessionController } from '../src/runtime/session-controller'
import { contextWindowOf } from '../src/runtime/model-catalog'
import { render } from 'ink-testing-library'
import React from 'react'
import { StatusBar } from '../src/ui/StatusBar'
import type { AgentStatusSnapshot } from '../src/runtime/types'

function driver(): { ctrl: SessionController; emit: (event: unknown) => void } {
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
  return { ctrl, emit: (event) => { handlers.get('session/event')?.(session, event) } }
}

describe('plan-mode pin', () => {
  it('plan/mode events flip the snapshot flag', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'plan/mode', seq: 1, data: { active: true } })
    expect(ctrl.state.agent.planMode).toBe(true)
    emit({ type: 'plan/mode', seq: 2, data: { active: false } })
    expect(ctrl.state.agent.planMode).toBe(false)
  })

  it('the status bar renders the [plan] chip only while active', async () => {
    const snap = (planMode: boolean): AgentStatusSnapshot => ({
      status: 'idle', activeAgent: undefined, activeModel: 'm1', activeProvider: 'p1',
      lastTurnReason: undefined, contextUsedTokens: 10, contextLimitTokens: 1000, planMode,
    })
    const on = render(<StatusBar agent={snap(true)} prefix={undefined} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(on.lastFrame() ?? '').toContain('[plan]')
    on.unmount()
    const off = render(<StatusBar agent={snap(false)} prefix={undefined} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(off.lastFrame() ?? '').not.toContain('[plan]')
    off.unmount()
  })
})

describe('user/message transcript echo', () => {
  it("renders the user's typed input as a transcript row", () => {
    const { ctrl, emit } = driver()
    emit({ type: 'user/message', seq: 1, data: { id: 'u1', role: 'user', content: [{ type: 'text', text: '在吗' }], source: { kind: 'user' } } })
    const row = ctrl.state.messages.find((m) => m.kind === 'user')
    expect(row?.text).toBe('在吗')
    expect(row?.streaming).toBe(false)
  })

  it('drops the steered duplicate (already echoed as ↪ 已插话)', () => {
    const { ctrl, emit } = driver()
    ctrl.noteSteered('你在做什么')
    emit({ type: 'user/message', seq: 1, data: { id: 'u1', role: 'user', content: [{ type: 'text', text: '你在做什么' }], source: { kind: 'user' } } })
    expect(ctrl.state.messages.filter((m) => m.kind === 'user')).toHaveLength(0)
    // A different later input still shows.
    emit({ type: 'user/message', seq: 2, data: { id: 'u2', role: 'user', content: [{ type: 'text', text: '另一句' }], source: { kind: 'user' } } })
    expect(ctrl.state.messages.filter((m) => m.kind === 'user')).toHaveLength(1)
  })

  it('ignores platform-injected (non-user-source) messages and empty text', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'user/message', seq: 1, data: { id: 'n1', role: 'user', content: [{ type: 'text', text: 'compaction notice' }], source: { kind: 'plugin' } } })
    emit({ type: 'user/message', seq: 2, data: { id: 'n2', role: 'user', content: [], source: { kind: 'user' } } })
    expect(ctrl.state.messages.filter((m) => m.kind === 'user')).toHaveLength(0)
  })
})

describe('permission preset pin', () => {
  it('permission/preset events update the snapshot', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'permission/preset', seq: 1, data: { preset: 'workspace-write' } })
    expect(ctrl.state.agent.permissionPreset).toBe('workspace-write')
    emit({ type: 'permission/preset', seq: 2, data: { preset: 'read-only' } })
    expect(ctrl.state.agent.permissionPreset).toBe('read-only')
  })

  it('the status bar shows the short chip per preset', async () => {
    const snap = (preset: string | undefined): AgentStatusSnapshot => ({
      status: 'idle', activeAgent: undefined, activeModel: 'm', activeProvider: 'p',
      lastTurnReason: undefined, contextUsedTokens: 0, contextLimitTokens: 100,
      planMode: false, permissionPreset: preset,
    })
    for (const [preset, chip] of [['workspace-write', '[write]'], ['read-only', '[read-only]'], ['danger-full-access', '[full]'], ['custom', '[custom]']] as const) {
      const { lastFrame, unmount } = render(<StatusBar agent={snap(preset)} prefix={undefined} />)
      await new Promise((r) => setTimeout(r, 25))
      expect(lastFrame() ?? '').toContain(chip)
      unmount()
    }
    const none = render(<StatusBar agent={snap(undefined)} prefix={undefined} />)
    await new Promise((r) => setTimeout(r, 25))
    expect(none.lastFrame() ?? '').not.toContain('[write]')
    expect(none.lastFrame() ?? '').not.toContain('[read-only]')
    none.unmount()
  })
})

describe('request/context effective window (token-meter parity)', () => {
  it('sets the limit from the adapter-resolved window and refreshes model', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'request/context', seq: 1, data: { provider: 'scnet', model: 'DeepSeek-V4.1-Flash', contextWindow: 262144 } })
    expect(ctrl.state.agent.contextLimitTokens).toBe(262144)
    expect(ctrl.state.agent.activeModel).toBe('DeepSeek-V4.1-Flash')
    // A later request under a different model updates the bar.
    emit({ type: 'request/context', seq: 2, data: { provider: 'glm-codingplan', model: 'glm-5.3-flash', contextWindow: 1000000 } })
    expect(ctrl.state.agent.contextLimitTokens).toBe(1000000)
  })

  it('keeps the previous limit when the request carries no window', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'request/context', seq: 1, data: { provider: 'p', model: 'm', contextWindow: 204800 } })
    emit({ type: 'request/context', seq: 2, data: { provider: 'p', model: 'm2' } })
    expect(ctrl.state.agent.contextLimitTokens).toBe(204800)
    expect(ctrl.state.agent.activeModel).toBe('m2')
  })

  it('ignores junk windows', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'request/context', seq: 1, data: { contextWindow: Number.NaN } })
    expect(ctrl.state.agent.contextLimitTokens).toBeUndefined()
  })
})

describe('honest context limit', () => {
  it('catalog lookup finds declared windows and misses undeclared ones', () => {
    const piAi = {
      providers: {
        scnet: { models: [{ id: 'GLM-5.3' }, { id: 'V4.1', contextWindow: 204800 }] },
      },
    }
    expect(contextWindowOf(piAi, 'scnet', 'V4.1')).toBe(204800)
    expect(contextWindowOf(piAi, 'scnet', 'GLM-5.3')).toBeUndefined()
    expect(contextWindowOf(undefined, 'scnet', 'V4.1')).toBeUndefined()
  })

  it('usage bar shows bare tokens without an invented limit', async () => {
    const snap: AgentStatusSnapshot = {
      status: 'idle', activeAgent: undefined, activeModel: 'm', activeProvider: 'p',
      lastTurnReason: undefined, contextUsedTokens: 4200, contextLimitTokens: undefined, planMode: false,
    }
    const { lastFrame, unmount } = render(<StatusBar agent={snap} prefix={undefined} />)
    await new Promise((r) => setTimeout(r, 30))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('4.2k tokens')
    expect(frame).not.toContain('128')
    unmount()
  })
})
