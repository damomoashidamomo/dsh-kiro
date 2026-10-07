import { describe, it, expect } from 'vitest'
import { SessionController } from '../src/runtime/session-controller'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * Regression: tool/result used to flip `streaming` on messages.at(-1), so a
 * SECOND parallel tool/call (or any interleaved message) orphaned the first
 * call — it stayed `streaming: true` forever, pinning every later message
 * into Ink's live region (scrollback spam + a seemingly frozen UI).
 */
function driver(): {
  ctrl: SessionController
  emit: (event: SessionEvent) => void
} {
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
  return {
    ctrl,
    emit: (event) => { handlers.get('session/event')?.(session, event) },
  }
}

const callA = { turn: 1, step: 1, callId: 'call-A', name: 'read', arguments: '{"file_path":"a"}' }
const callB = { turn: 1, step: 1, callId: 'call-B', name: 'read', arguments: '{"file_path":"b"}' }

function resultFor(callId: string, text: string): { type: 'tool/result'; seq: number; data: unknown } {
  return {
    type: 'tool/result',
    seq: 99,
    data: { turn: 1, step: 1, message: { role: 'user', content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text }] }] } },
  }
}

describe('parallel tool-call correlation (orphaned streaming regression)', () => {
  it('two calls in flight: each result closes ITS call, not the last message', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'tool/call', seq: 1, data: callA } as never)
    emit({ type: 'tool/call', seq: 2, data: callB } as never)
    expect(ctrl.state.messages.filter((m) => m.kind === 'tool-call')).toHaveLength(2)
    // Results arrive in order: A first even though B was called too.
    emit(resultFor('call-A', 'A output') as never)
    emit(resultFor('call-B', 'B output') as never)
    const toolMessages = ctrl.state.messages.filter((m) => m.kind === 'tool-call')
    expect(toolMessages.every((m) => m.streaming === false)).toBe(true)
    expect(toolMessages.map((m) => m.tool?.output)).toEqual(['A output', 'B output'])
    expect(toolMessages.map((m) => m.tool?.state)).toEqual(['done', 'done'])
    expect(ctrl.state.hasActiveTool).toBe(false)
  })

  it('interleaved assistant text between call and result still correlates', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'tool/call', seq: 1, data: callA } as never)
    emit({ type: 'assistant/chunk', seq: 2, data: { chunk: { type: 'text-delta', text: 'meanwhile…' } } } as never)
    emit(resultFor('call-A', 'late') as never)
    const toolMessage = ctrl.state.messages.find((m) => m.kind === 'tool-call')
    expect(toolMessage?.streaming).toBe(false)
    expect(toolMessage?.tool?.output).toBe('late')
    // The assistant message must NOT have been given the tool record.
    const assistant = ctrl.state.messages.find((m) => m.kind === 'assistant')
    expect(assistant?.tool).toBeUndefined()
  })

  it('a result for an unknown callId is ignored (no corruption)', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'tool/call', seq: 1, data: callA } as never)
    emit(resultFor('call-UNKNOWN', 'x') as never)
    const toolMessage = ctrl.state.messages.find((m) => m.kind === 'tool-call')
    expect(toolMessage?.tool?.state).toBe('running')
  })

  it('turn/end sweeps any still-streaming tool call as failed', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'tool/call', seq: 1, data: callA } as never)
    emit({ type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind: 'completed' } } } as never)
    const toolMessage = ctrl.state.messages.find((m) => m.kind === 'tool-call')
    expect(toolMessage?.streaming).toBe(false)
    expect(toolMessage?.tool?.state).toBe('failed')
  })

  it('hasActiveTool stays true while either parallel call runs', () => {
    const { ctrl, emit } = driver()
    emit({ type: 'tool/call', seq: 1, data: callA } as never)
    emit({ type: 'tool/call', seq: 2, data: callB } as never)
    emit(resultFor('call-A', 'A') as never)
    expect(ctrl.state.hasActiveTool).toBe(true)
    emit(resultFor('call-B', 'B') as never)
    expect(ctrl.state.hasActiveTool).toBe(false)
  })
})
