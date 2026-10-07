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
