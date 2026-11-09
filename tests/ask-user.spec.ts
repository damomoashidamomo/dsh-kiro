import { describe, it, expect, vi } from 'vitest'
import { registerLoopTools } from '../src/runtime/loop-tools'

/** ask_user：模型主动向用户提问的工具（HITL a）。答案映射与参数校验。 */

function makeRegistry() {
  const registered: Array<{ name: string; execute: (args: unknown, extra?: unknown) => Promise<unknown> }> = []
  const ctx = {
    tools: { register: (def: never) => { registered.push(def as never); return () => undefined } },
    get: (name: string) => name === 'userQuestions' ? fakeUq : undefined,
  }
  const fakeUq = {
    ask: vi.fn(async (request: { questions: { id: string; question: string }[] }) => ({
      answers: request.questions.map((q) => ({ id: q.id, selected: ['方案 B'], custom: '预算别超 1 万' })),
    })),
  }
  registerLoopTools(ctx as never, { controller: { ingestEvent: () => undefined } } as never)
  const askUser = registered.find((t) => t.name === 'ask_user')
  expect(askUser).toBeDefined()
  return { askUser: askUser!, fakeUq }
}

describe('ask_user tool', () => {
  it('registers alongside the loop tools', () => {
    makeRegistry()
  })

  it('passes the question to the user-questions waterfall and maps the answer', async () => {
    const { askUser, fakeUq } = makeRegistry()
    const result = (await askUser.execute({
      question: '方案 A 还是方案 B？',
      header: '方案决策',
      options: [{ label: '方案 A' }, { label: '方案 B', description: '推荐' }],
    })) as { answered: boolean; answer: string }
    expect(fakeUq.ask).toHaveBeenCalledTimes(1)
    const request = (fakeUq.ask as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(request.questions[0].question).toBe('方案 A 还是方案 B？')
    expect(request.questions[0].options).toHaveLength(2)
    expect(result.answered).toBe(true)
    expect(result.answer).toContain('方案 B')
    expect(result.answer).toContain('预算别超 1 万')
  })

  it('errors cleanly without a question', async () => {
    const { askUser } = makeRegistry()
    const result = (await askUser.execute({})) as { answered: boolean; error?: string }
    expect(result.answered).toBe(false)
    expect(result.error).toContain('is required')
  })

  it('reports when the question service is unavailable', async () => {
    const registered: Array<{ name: string; execute: (args: unknown) => Promise<unknown> }> = []
    const ctx = { tools: { register: (d: never) => { registered.push(d as never); return () => undefined } }, get: () => undefined }
    registerLoopTools(ctx as never, { controller: { ingestEvent: () => undefined } } as never)
    const askUser = registered.find((t) => t.name === 'ask_user')!
    const result = (await askUser.execute({ question: '在吗' })) as { answered: boolean; error: string }
    expect(result.answered).toBe(false)
    expect(result.error).toContain('userQuestions')
  })
})
