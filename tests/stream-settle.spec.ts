import { describe, it, expect } from 'vitest'
import { SessionController } from '../src/runtime/session-controller'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * Streaming answers settle block-by-block into finished messages so Ink's
 * live region (fully erased + rewritten every frame) stays small. These
 * specs pin the settle boundary rules, the durable in-place finalize (no
 * duplicate answer), and the turn-end safety net.
 */
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
  return {
    ctrl,
    emit: (event) => { handlers.get('session/event')?.(session, event) },
  }
}

const delta = (text: string) => ({
  type: 'assistant/chunk',
  seq: 0,
  data: { chunk: { type: 'text-delta', text } },
})

const durable = (text: string, seq = 5) => ({
  type: 'assistant/message',
  seq,
  data: { message: { content: [{ type: 'text', text }] } },
})

const assistantTexts = (ctrl: SessionController): string[] =>
  ctrl.state.messages.filter((m) => m.kind === 'assistant').map((m) => m.text)

describe('streaming settle into Static pieces', () => {
  it('settles complete lines and keeps only the tail live', () => {
    const { ctrl, emit } = driver()
    emit(delta('第一行内容\n') as never)
    emit(delta('第二行内容\n') as never)
    emit(delta('第三段还在写') as never)
    const assistant = ctrl.state.messages.filter((m) => m.kind === 'assistant')
    expect(assistant).toHaveLength(3)
    expect(assistant.filter((m) => m.streaming)).toHaveLength(1)
    // The live segment keeps the FULL streamed text; only the part past
    // `settledUpTo` renders (see Message.AssistantMessage).
    const tail = assistant[2]
    expect(tail?.text.slice(tail.settledUpTo ?? 0)).toBe('第三段还在写')
    // First piece carries the ◆ marker; continuations do not.
    expect(assistant[0]?.continuation).toBeFalsy()
    expect(assistant[1]?.continuation).toBe(true)
    // Live tail renders as continuation via settledUpTo > 0.
    expect((assistant[2]?.settledUpTo ?? 0) > 0).toBe(true)
  })

  it('finalizes the segment in place on the durable commit — no duplicate copy', () => {
    const { ctrl, emit } = driver()
    emit(delta('alpha line\n') as never)
    emit(delta('beta line\n') as never)
    emit(delta('gamma tail') as never)
    emit(durable('alpha line\nbeta line\ngamma tail', 7) as never)
    expect(ctrl.state.messages.some((m) => m.streaming)).toBe(false)
    // After the in-place finalize the pieces joined equal the full answer
    // with no duplicate copy of it.
    expect(assistantTexts(ctrl)).toEqual(['alpha line', 'beta line', 'gamma tail'])
    const last = ctrl.state.messages.at(-1)
    expect(last?.seq).toBe(7)
  })

  it('appends the durable message when nothing was streamed (non-streamed model)', () => {
    const { ctrl, emit } = driver()
    emit(durable('plain answer', 3) as never)
    expect(assistantTexts(ctrl)).toEqual(['plain answer'])
    expect(ctrl.state.messages.at(-1)?.streaming).toBe(false)
  })

  it('keeps an open code fence live until it closes', () => {
    const { ctrl, emit } = driver()
    emit(delta('intro\n```ts\nconst a = 1\n') as never)
    // Fence is open — the intro before it may settle, but the fence may not.
    const intro = ctrl.state.messages.find((m) => m.kind === 'assistant' && !m.streaming)
    expect(intro?.text).toBe('intro')
    const live = ctrl.state.messages.at(-1)
    expect(live?.streaming).toBe(true)
    expect(live?.text).toContain('```ts')
    emit(delta('```\nafter fence') as never)
    const live2 = ctrl.state.messages.at(-1)
    const fencePiece = ctrl.state.messages.find((m) => m.kind === 'assistant' && !m.streaming && m.text.includes('const a = 1'))
    expect(fencePiece?.text.includes('```ts')).toBe(true)
    expect(live2?.streaming).toBe(true)
    expect(live2?.text.slice(live2.settledUpTo ?? 0)).toBe('after fence')
  })

  it('does not cut GFM table rows apart', () => {
    const { ctrl, emit } = driver()
    emit(delta('| a | b |\n|---|---|\n| 1 | 2 |\n') as never)
    const live = ctrl.state.messages.at(-1)
    expect(live?.streaming).toBe(true)
    // The whole table is still one live message (settled nothing).
    expect(ctrl.state.messages.filter((m) => m.kind === 'assistant')).toHaveLength(1)
    expect(live?.text).toContain('| 1 | 2 |')
  })

  it('closes a stuck streaming segment on turn/end (cancel mid-stream)', () => {
    const { ctrl, emit } = driver()
    emit(delta('partial answer\nmore') as never)
    emit({ type: 'turn/end', seq: 9, data: { reason: { kind: 'cancelled' } } } as never)
    expect(ctrl.state.messages.some((m) => m.streaming)).toBe(false)
    const done = ctrl.state.messages.filter((m) => m.kind === 'assistant')
    expect(done.map((m) => m.text)).toEqual(['partial answer', 'more'])
  })
})
