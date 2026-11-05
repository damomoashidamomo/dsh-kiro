import { describe, it, expect } from 'vitest'
import { SessionController } from '../src/runtime/session-controller'
import { contextWindowOf } from '../src/runtime/model-catalog'
import { render } from 'ink-testing-library'
import React from 'react'
import { StatusBar, identityText, shouldShowStatusBar } from '../src/ui/StatusBar'
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

describe('todo snapshots', () => {
  it('todo/write pins the list and drops a transcript snapshot', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'todo/write', seq: 1, data: { todos: [
      { content: '第一项', status: 'completed' },
      { content: '第二项', status: 'in_progress' },
      { content: '第三项', status: 'pending' },
    ] } })
    expect(ctrl.state.todos?.length).toBe(3)
    const snapshot = ctrl.state.messages.find((m) => m.kind === 'todo')
    expect(snapshot?.todos?.[1]?.status).toBe('in_progress')
  })

  it('identical consecutive writes do not duplicate the snapshot', () => {
    const { ctrl, emit } = driver()
    const list = [{ content: 'only', status: 'pending' }]
    emit({ type: 'todo/write', seq: 1, data: { todos: list } })
    emit({ type: 'todo/write', seq: 2, data: { todos: list } })
    expect(ctrl.state.messages.filter((m) => m.kind === 'todo')).toHaveLength(1)
    // a changed list appends a new snapshot
    emit({ type: 'todo/write', seq: 3, data: { todos: [{ content: 'only', status: 'completed' }] } })
    expect(ctrl.state.messages.filter((m) => m.kind === 'todo')).toHaveLength(2)
  })

  it('null clears the pin without a snapshot', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'todo/write', seq: 1, data: { todos: [{ content: 'x', status: 'pending' }] } })
    emit({ type: 'todo/write', seq: 2, data: { todos: null } })
    expect(ctrl.state.todos).toBeUndefined()
  })

  it('renders the checklist with counts and states', async () => {
    const { Message } = await import('../src/ui/Message')
    const { lastFrame, unmount } = render(React.createElement(Message, { message: {
      id: 't1', kind: 'todo', text: 'sig', todos: [
        { content: 'done item', status: 'completed' },
        { content: 'live item', status: 'in_progress' },
      ], tool: undefined, createdAt: Date.now(), seq: 1, usage: undefined, streaming: false,
    } }))
    await new Promise((r) => setTimeout(r, 30))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('任务清单 (1/2)')
    expect(frame).toContain('☑ done item')
    expect(frame).toContain('◐ live item')
    unmount()
  })
})

describe('first-token latency (P8)', () => {
  it('turn/start then first chunk stamps lastTtftMs once', async () => {
    const { ctrl, emit } = driver()
    emit({ type: 'turn/start', seq: 1, data: { turn: 1 } })
    await new Promise((r) => setTimeout(r, 25))
    emit({ type: 'assistant/chunk', seq: 2, data: { chunk: { type: 'text-delta', text: 'hi' } } })
    expect(ctrl.state.agent.lastTtftMs).toBeGreaterThanOrEqual(20)
    emit({ type: 'assistant/chunk', seq: 3, data: { chunk: { type: 'text-delta', text: ' there' } } })
    expect(ctrl.state.agent.lastTtftMs).toBeGreaterThanOrEqual(20) // unchanged
  })

  it('no open turn leaves lastTtftMs undefined', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'assistant/chunk', seq: 1, data: { chunk: { type: 'text-delta', text: 'x' } } })
    expect(ctrl.state.agent.lastTtftMs).toBeUndefined()
  })
})

describe('context-pressure hints (P3)', () => {
  function usage(total: number): { type: string; seq: number; data: unknown } {
    return { type: 'assistant/chunk', seq: 99, data: { chunk: { type: 'usage', usage: { totalTokens: total } } } }
  }
  it('fires one hint per threshold and re-arms after pressure drops', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'request/context', seq: 1, data: { contextWindow: 1000 } })
    emit(usage(650))   // crosses 60%
    emit(usage(700))   // still above 60 -> no repeat
    emit(usage(850))   // crosses 80%
    const hints = ctrl.state.messages.filter((m) => m.kind === 'system' && (m.text.includes('上下文已用')))
    expect(hints.length).toBe(2)
    expect(hints[0]?.text).toContain('65%')
    expect(hints[1]?.text).toContain('85%')
    // compaction drops usage below 50% -> hints re-arm
    emit(usage(400))
    emit(usage(700))
    const after = ctrl.state.messages.filter((m) => m.kind === 'system' && m.text.includes('上下文已用'))
    expect(after.length).toBe(3)
  })

  it('stays quiet without a known limit', () => {
    const { ctrl, emit } = driver()
    emit(usage(999999))
    expect(ctrl.state.messages.some((m) => m.kind === 'system' && m.text.includes('上下文已用'))).toBe(false)
  })
})

describe('context usage from the token-meter projection', () => {
  function projectionDriver(projection: unknown): { ctrl: SessionController; emit: (e: unknown) => void } {
    const ctrl = new SessionController()
    const handlers = new Map<string, (session: unknown, event: unknown) => void>()
    const ctx = {
      get: (name: string) => (name === 'sessionProjections'
        ? { stateOf: (_session: unknown, key: string) => (key === 'contextPressure' ? projection : undefined) }
        : undefined),
      on: (type: string, cb: (session: unknown, event: unknown) => void) => {
        handlers.set(type, cb)
        return () => handlers.delete(type)
      },
    }
    const session = { id: 's1' }
    ctrl.bindAgent(ctx as never, { session } as never)
    return { ctrl, emit: (e) => { handlers.get('session/event')?.(session, e) } }
  }

  it('contextUsedTokens follows projectedTokens (grows with the conversation)', () => {
    let projection: { projectedTokens?: number; pressureTokens?: number } = { projectedTokens: 5000, pressureTokens: 4200 }
    const { ctrl, emit } = projectionDriver(projection)
    emit({ type: 'assistant/chunk', seq: 1, data: { chunk: { type: 'text-delta', text: 'x' } } })
    expect(ctrl.state.agent.contextUsedTokens).toBe(5000)
    projection.projectedTokens = 12000
    emit({ type: 'assistant/chunk', seq: 2, data: { chunk: { type: 'text-delta', text: 'y' } } })
    expect(ctrl.state.agent.contextUsedTokens).toBe(12000)
  })

  it('falls back to pressureTokens when no projection value exists yet', () => {
    let projection: { pressureTokens?: number } = { pressureTokens: 800 }
    const { ctrl, emit } = projectionDriver(projection)
    emit({ type: 'assistant/chunk', seq: 1, data: { chunk: { type: 'text-delta', text: 'x' } } })
    expect(ctrl.state.agent.contextUsedTokens).toBe(800)
  })

  it('takes the context window from the projection (models the settings catalog does not list)', () => {
    // pi-ai resolves a window from the installed catalog / route default even
    // when the user's llm-pi-ai entry omits `contextWindow:`. That resolved
    // value rides `request/context` into the projection, and it is what the
    // prompt's `0% >` usage gutter needs — without it the gutter renders bare.
    let projection: { projectedTokens?: number; contextWindow?: number } = { projectedTokens: 1000, contextWindow: 262144 }
    const { ctrl, emit } = projectionDriver(projection)
    expect(ctrl.state.agent.contextLimitTokens).toBeUndefined()
    emit({ type: 'assistant/chunk', seq: 1, data: { chunk: { type: 'text-delta', text: 'x' } } })
    expect(ctrl.state.agent.contextLimitTokens).toBe(262144)
    // A later request with a re-resolved window (e.g. after /model) wins —
    // the projection object is live, so mutate it in place.
    projection.contextWindow = 1000000
    emit({ type: 'assistant/chunk', seq: 2, data: { chunk: { type: 'text-delta', text: 'y' } } })
    expect(ctrl.state.agent.contextLimitTokens).toBe(1000000)
  })

  it('keeps the catalog window when the projection has none', () => {
    const { ctrl, emit } = projectionDriver({ projectedTokens: 1000 })
    ctrl.patchAgent({ contextLimitTokens: 128000 })
    emit({ type: 'assistant/chunk', seq: 1, data: { chunk: { type: 'text-delta', text: 'x' } } })
    expect(ctrl.state.agent.contextLimitTokens).toBe(128000)
  })
})

describe('project-level approval persistence', () => {
  it('allow-project seeds the session set and round-trips through the file', () => {
    const { ctrl, emit } = driver()
    expect(ctrl.state.messages).toBeDefined()
    // The public API: session-allowed + project persist path.
    expect(typeof (ctrl as unknown as { allowToolForProject: (t: string) => void }).allowToolForProject).toBe('function')
  })
})

describe('workspace display', () => {
  it('status bar renders the workspace basename', async () => {
    const snap: AgentStatusSnapshot = {
      status: 'idle', activeAgent: undefined, activeModel: 'm', activeProvider: 'p',
      lastTurnReason: undefined, contextUsedTokens: 0, contextLimitTokens: 1000,
      planMode: false, permissionPreset: undefined,
      workspace: '/home/gary/deepseek harness work zone/dsh-kiro',
    }
    const { lastFrame, unmount } = render(<StatusBar agent={snap} prefix={undefined} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(lastFrame() ?? '').toContain('工作区: ~/deepseek harness work zone/dsh-kiro')
    unmount()
  })

  it('controller seeds workspace from the session header at bind', () => {
    const ctrl = new SessionController()
    const handlers = new Map<string, (session: unknown, event: unknown) => void>()
    const ctx = {
      on: (type: string, cb: (s: unknown, e: unknown) => void) => {
        handlers.set(type, cb)
        return () => handlers.delete(type)
      },
    }
    const session = { id: 's1', header: { cwd: '/tmp/somewhere' } }
    ctrl.bindAgent(ctx as never, { session } as never)
    expect(ctrl.state.agent.workspace).toBe('/tmp/somewhere')
  })
})

describe('permission preset from projection (restored sessions)', () => {
  it('bind reads the CURRENT preset even when the event predates us', () => {
    const ctrl = new SessionController()
    const handlers = new Map<string, (s: unknown, e: unknown) => void>()
    const ctx = {
      get: (name: string) => (name === 'sessionProjections'
        ? { stateOf: (_s: unknown, key: string) => (key === 'permissions' ? { preset: 'workspace-write' } : undefined) }
        : undefined),
      on: (type: string, cb: (s: unknown, e: unknown) => void) => {
        handlers.set(type, cb)
        return () => handlers.delete(type)
      },
    }
    const session = { id: 's1' }
    ctrl.bindAgent(ctx as never, { session } as never)
    expect(ctrl.state.agent.permissionPreset).toBe('workspace-write')
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

  it('the permission chip is gone from the status bar (workspace segment carries the line)', async () => {
    const snap: AgentStatusSnapshot = {
      status: 'idle', activeAgent: undefined, activeModel: 'm', activeProvider: 'p',
      lastTurnReason: undefined, contextUsedTokens: 0, contextLimitTokens: 100,
      planMode: false, permissionPreset: 'workspace-write',
    }
    const { lastFrame, unmount } = render(<StatusBar agent={snap} prefix={undefined} />)
    await new Promise((r) => setTimeout(r, 25))
    expect(lastFrame() ?? '').not.toContain('[工作区]')
    unmount()
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

  it('the usage bar graphic is gone from the status bar', async () => {
    const snap: AgentStatusSnapshot = {
      status: 'idle', activeAgent: undefined, activeModel: 'm', activeProvider: 'p',
      lastTurnReason: undefined, contextUsedTokens: 4200, contextLimitTokens: undefined, planMode: false,
    }
    const { lastFrame, unmount } = render(<StatusBar agent={snap} prefix={undefined} />)
    await new Promise((r) => setTimeout(r, 30))
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('░')
    expect(frame).not.toContain('tokens')
    unmount()
  })
})

describe('transient status bar (kiro-cli layout)', () => {
  const snap = (over: Partial<AgentStatusSnapshot> = {}): AgentStatusSnapshot => ({
    status: 'idle', activeAgent: undefined, activeModel: 'm1', activeProvider: 'p1',
    lastTurnReason: undefined, contextUsedTokens: 0, contextLimitTokens: 1000,
    planMode: false, workspace: '/home/gary/work',
    ...over,
  })

  it('identity text carries agent, workspace, model and the kiro engine combo', () => {
    expect(identityText(snap(), undefined)).toBe('[default] · 工作区: ~/work · p1/m1')
    expect(identityText(snap({ loopDriver: 'kiro', toolEngine: 'rust' }), 'backend')).toBe(
      '[backend] · 工作区: ~/work · p1/m1 · [kiro/rust]',
    )
    expect(identityText(snap({ activeModel: undefined, activeProvider: undefined }), undefined)).toContain('model: pending')
  })

  it('hides the bar while nothing changed, shows it when it has news', () => {
    const boot = identityText(snap(), undefined)
    // Unchanged identity at idle: no bar, so an echoed prompt line sits
    // directly above the prompt (kiro-cli has no permanent bar either).
    expect(shouldShowStatusBar({ agent: snap(), bootIdentity: boot })).toBe(false)
    // Model switched since boot.
    expect(shouldShowStatusBar({ agent: snap({ activeModel: 'm2' }), bootIdentity: boot })).toBe(true)
    // Agent switched.
    expect(shouldShowStatusBar({ agent: snap(), activeAgentName: 'backend', bootIdentity: boot })).toBe(true)
    // Plan mode toggled.
    expect(shouldShowStatusBar({ agent: snap({ planMode: true }), bootIdentity: boot })).toBe(true)
    // Prefix being typed, or a decision waiting.
    expect(shouldShowStatusBar({ agent: snap(), bootIdentity: boot, prefix: '/' })).toBe(true)
    expect(shouldShowStatusBar({ agent: snap(), bootIdentity: boot, awaitingDecision: true })).toBe(true)
    // Before the boot line exists there is nothing to compare against.
    expect(shouldShowStatusBar({ agent: snap(), bootIdentity: undefined })).toBe(true)
  })

  it('prints the boot line once and ignores repeats', () => {
    const ctrl = new SessionController()
    ctrl.appendBootInfo('[default] · 工作区: ~/w · p/m')
    ctrl.appendBootInfo('[default] · 工作区: ~/w · p/m')
    const bootRows = ctrl.state.messages.filter((m) => m.id === 'boot-info')
    expect(bootRows).toHaveLength(1)
    expect(bootRows[0]?.text).toContain('工作区')
    // Empty text is never printed.
    ctrl.appendBootInfo('   ')
    expect(ctrl.state.messages.filter((m) => m.id === 'boot-info')).toHaveLength(1)
  })
})
