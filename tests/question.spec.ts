import { describe, it, expect, vi } from 'vitest'
import { SessionController } from '../src/runtime/session-controller'
import { createQuestionAnswerer } from '../src/runtime/question-answerer'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'

const question = {
  id: 'plan-review',
  header: 'Plan review',
  question: 'Approve this plan and leave plan mode?',
  detail: '# My plan\n1. do things',
  options: [
    { label: 'Approve', description: 'Leave plan mode' },
    { label: 'Keep planning', description: 'Stay and revise' },
  ],
  intent: { kind: 'plan-review' as const, approve: 'Approve' },
}

function bootController(): SessionController {
  return new SessionController()
}

function fakeAbortSignal(aborted = false): AbortSignal & { trigger(): void } {
  const controller = new AbortController()
  const signal = controller.signal as AbortSignal & { trigger(): void }
  signal.trigger = () => { controller.abort() }
  if (aborted) controller.abort()
  return signal
}

describe('question state machine (controller)', () => {
  it('open → resolve answer flows the choice through', async () => {
    const controller = bootController()
    const promise = controller.openQuestion({
      id: question.id, header: question.header, question: question.question,
      detail: question.detail, options: question.options, approveLabel: 'Approve',
    })
    expect(controller.state.question?.question).toContain('Approve this plan')
    controller.resolveQuestion({ kind: 'answer', selected: ['Approve'], custom: undefined })
    await expect(promise).resolves.toEqual({ kind: 'answer', selected: ['Approve'], custom: undefined })
    expect(controller.state.question).toBeUndefined()
  })

  it('cancel resolves dismissed and closes the panel', async () => {
    const controller = bootController()
    const promise = controller.openQuestion({
      id: question.id, header: undefined, question: question.question,
      detail: undefined, options: [], approveLabel: undefined,
    })
    controller.cancelQuestion()
    await expect(promise).resolves.toEqual({ kind: 'dismissed' })
    expect(controller.state.question).toBeUndefined()
  })

  it('a pre-aborted signal resolves dismissed without opening the panel', async () => {
    const controller = bootController()
    const promise = controller.openQuestion({
      id: 'q', header: undefined, question: '?', detail: undefined, options: [], approveLabel: undefined,
    }, fakeAbortSignal(true))
    await expect(promise).resolves.toEqual({ kind: 'dismissed' })
    expect(controller.state.question).toBeUndefined()
  })

  it('aborting the signal mid-question cancels to dismissed', async () => {
    const controller = bootController()
    const signal = fakeAbortSignal()
    const promise = controller.openQuestion({
      id: 'q', header: undefined, question: '?', detail: undefined, options: [], approveLabel: undefined,
    }, signal)
    signal.trigger()
    await expect(promise).resolves.toEqual({ kind: 'dismissed' })
  })

  it('turn/end withdraws a pending question', async () => {
    const controller = bootController()
    const handlers = new Map<string, (session: unknown, event: unknown) => void>()
    const ctx = {
      on: (type: string, cb: (session: unknown, event: unknown) => void) => {
        handlers.set(type, cb)
        return () => handlers.delete(type)
      },
    }
    const session = { id: 's1' }
    controller.bindAgent(ctx as never, { session } as never)
    const promise = controller.openQuestion({
      id: 'q', header: undefined, question: '?', detail: undefined, options: [], approveLabel: undefined,
    })
    handlers.get('session/event')?.(session, {
      type: 'turn/end',
      seq: 1,
      data: { turn: 1, reason: { kind: 'completed' } },
    })
    await expect(promise).resolves.toEqual({ kind: 'dismissed' })
  })
})

describe('question answerer (waterfall contract)', () => {
  it('maps an approve answer with no custom text', async () => {
    const ui = {
      openQuestion: vi.fn().mockResolvedValue({ kind: 'answer', selected: ['Approve'], custom: undefined }),
    }
    const answerer = createQuestionAnswerer(ui)
    const answer = await answerer({ questions: [question] })
    expect(answer.answers).toEqual([{ id: 'plan-review', selected: ['Approve'] }])
    expect(ui.openQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ approveLabel: 'Approve', question: question.question }),
      undefined,
    )
  })

  it('maps keep-planning feedback onto custom text', async () => {
    const ui = {
      openQuestion: vi.fn().mockResolvedValue({ kind: 'answer', selected: ['Keep planning'], custom: '  add tests  ' }),
    }
    const answer = await createQuestionAnswerer(ui)({ questions: [question] })
    expect(answer.answers[0]?.selected).toEqual(['Keep planning'])
    expect(answer.answers[0]?.custom).toBe('add tests')
  })

  it('a dismissed panel throws UserQuestionError ASK_CANCELLED', async () => {
    const ui = { openQuestion: vi.fn().mockResolvedValue({ kind: 'dismissed' }) }
    await expect(createQuestionAnswerer(ui)({ questions: [question] })).rejects.toMatchObject({
      name: 'UserQuestionError',
      code: 'ASK_CANCELLED',
    })
  })

  it('blank custom text is dropped (approve contract needs no custom)', async () => {
    const ui = {
      openQuestion: vi.fn().mockResolvedValue({ kind: 'answer', selected: ['Approve'], custom: '   ' }),
    }
    const answer = await createQuestionAnswerer(ui)({ questions: [question] })
    expect(answer.answers[0]?.custom).toBeUndefined()
  })

  it('UserQuestionError is the platform class (instanceof holds)', async () => {
    const ui = { openQuestion: vi.fn().mockResolvedValue({ kind: 'dismissed' }) }
    const err = await createQuestionAnswerer(ui)({ questions: [question] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UserQuestionError)
  })

  it('forwards the request signal to the UI', async () => {
    const ui = {
      openQuestion: vi.fn().mockResolvedValue({ kind: 'answer', selected: ['Approve'], custom: undefined }),
    }
    const signal = new AbortController().signal
    await createQuestionAnswerer(ui)({ questions: [question], signal })
    expect(ui.openQuestion).toHaveBeenCalledWith(expect.anything(), signal)
  })
})
