/**
 * /chat resume & /chat new — in-TUI session switching through the
 * `kiroSessionSwitch` service, plus the controller's persisted-log replay.
 */

import { describe, it, expect } from 'vitest'
import { chatCommand } from '../src/commands/chat'
import { SessionController } from '../src/runtime/session-controller'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

function agentWith(switchTo?: (target: string | undefined) => Promise<{ ok: boolean; message: string }>): unknown {
  return {
    ctx: {
      get: (name: string): unknown =>
        name === 'kiroSessionSwitch' && switchTo !== undefined ? { switchTo } : undefined,
    },
  }
}

const run = (agent: unknown, rawInput: string) =>
  chatCommand.handler({ agent, rawInput } as never)

describe('/chat session switching', () => {
  it('resume <id> delegates to the switch service', async () => {
    const calls: Array<string | undefined> = []
    const result = await run(
      agentWith(async (target) => {
        calls.push(target)
        return { ok: true, message: `已恢复会话 ${String(target)}。` }
      }),
      'resume session-abc',
    )
    expect(calls).toEqual(['session-abc'])
    expect(result.kind).toBe('success')
    expect(result.text).toContain('session-abc')
  })

  it('resume without an id shows usage plus recent sessions hint', async () => {
    const result = await run(agentWith(undefined), 'resume')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('usage: /chat resume <session-id>')
    expect(result.text).toContain('无需重启')
  })

  it('new opens a fresh session through the service', async () => {
    const calls: Array<string | undefined> = []
    const result = await run(
      agentWith(async (target) => {
        calls.push(target)
        return { ok: true, message: 'ok' }
      }),
      'new',
    )
    expect(calls).toEqual([undefined])
    expect(result.kind).toBe('success')
  })

  it('reports cleanly when the service is unavailable', async () => {
    const result = await run(agentWith(undefined), 'resume session-abc')
    expect(result.kind).toBe('error')
    expect(result.text).toContain('不可用')
  })

  it('surfaces a failed switch as an error', async () => {
    const result = await run(
      agentWith(async () => ({ ok: false, message: '切换失败：no such session' })),
      'resume session-missing',
    )
    expect(result.kind).toBe('error')
    expect(result.text).toContain('no such session')
  })
})

describe('SessionController.replayEvents', () => {
  function driver(): { ctrl: SessionController; emit: (event: SessionEvent) => void } {
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

  it('rebuilds the transcript from durable events and settles to idle', () => {
    const { ctrl } = driver()
    ctrl.replayEvents([
      { type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } } } as never,
      { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: 'hello' }] } } } as never,
      { type: 'tool/call', seq: 3, data: { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: '{}' } } as never,
      { type: 'tool/result', seq: 4, data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'out' }] }] } } } as never,
    ])
    expect(ctrl.state.messages.some((m) => m.kind === 'user' && m.text.includes('hi'))).toBe(true)
    expect(ctrl.state.messages.some((m) => m.kind === 'assistant' && m.text.includes('hello'))).toBe(true)
    expect(ctrl.state.messages.some((m) => m.streaming)).toBe(false)
    expect(ctrl.state.agent.status).toBe('idle')
  })

  it('skips malformed rows without aborting the replay', () => {
    const { ctrl } = driver()
    ctrl.replayEvents([
      { type: 'nonsense-event', seq: 1, data: { weird: true } } as never,
      { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: 'after' }] } } } as never,
    ])
    expect(ctrl.state.messages.some((m) => m.kind === 'assistant' && m.text.includes('after'))).toBe(true)
  })
})
