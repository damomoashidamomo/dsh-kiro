import { describe, it, expect } from 'vitest'
import { detectEffortHint, resolveAutoEffort } from '../src/runtime/effort-keywords'
import { effortCommand } from '../src/commands/effort'

describe('detectEffortHint (B-plan keyword escalation)', () => {
  it('matches high-tier phrases', () => {
    expect(detectEffortHint('帮我深入分析这个 crash 堆栈')).toBe('high')
    expect(detectEffortHint('think hard about the race condition')).toBe('high')
    expect(detectEffortHint('排查根因：为什么服务会重启')).toBe('high')
  })

  it('max phrases win over high when both appear', () => {
    expect(detectEffortHint('极限模式下深入分析这个崩溃')).toBe('max')
    expect(detectEffortHint('ultrathink this')).toBe('max')
  })

  it('plain prompts carry no hint', () => {
    expect(detectEffortHint('1+1等于几')).toBeUndefined()
    expect(detectEffortHint('把 v1 改成 v2')).toBeUndefined()
  })
})

describe('resolveAutoEffort (priority + capability gate)', () => {
  it('manual /effort wins over keywords', () => {
    expect(resolveAutoEffort('high', 'max', ['low', 'high', 'max'])).toBe('max')
  })

  it('keyword applies only when the model declares the level', () => {
    expect(resolveAutoEffort('high', undefined, ['low', 'high', 'max'])).toBe('high')
    // glm-5.3-flash declares no 'medium': hinted medium is dropped
    expect(resolveAutoEffort('medium', undefined, ['low', 'high', 'max'])).toBeUndefined()
    // undeclared model: no dial at all
    expect(resolveAutoEffort('high', undefined, undefined)).toBeUndefined()
  })
})

describe('/effort command (real wiring)', () => {
  function agentStub(opts: {
    declared?: Record<string, unknown>
    provider?: string
    model?: string
  }): unknown {
    const saved: unknown[] = []
    const applied: unknown[] = []
    const services: Record<string, unknown> = {
      kiroController: {
        getState: () => ({ agent: { activeProvider: opts.provider ?? 'glm-codingplan', activeModel: opts.model ?? 'glm-5.3-flash' } }),
      },
      settings: {
        get: (ns: string) => (ns === 'llm-pi-ai'
          ? { providers: { 'glm-codingplan': { models: [{ id: 'glm-5.3-flash', reasoningEfforts: opts.declared ?? { low: 'low', high: 'high', max: 'max' } }] } } }
          : undefined),
      },
      kiroModelSwitch: { apply: (next: unknown) => { applied.push(next) } },
      kiroEffortControl: { setManual: (level: string) => { applied.push({ manual: level }) }, current: () => undefined },
      agentDefaultModel: { saveSelection: async (next: unknown) => { saved.push(next) } },
    }
    const ctx = {
      get: (name: string) => services[name],
    }
    const agent = { ctx }
    return { agent: { ctx }, saved, applied }
  }

  it('applies + persists a declared level', async () => {
    const { agent, saved, applied } = agentStub({})
    const out = await effortCommand.handler!({ agent, rawInput: 'low' } as never)
    expect(out.kind).toBe('success')
    expect(applied.some((a) => (a as { reasoningEffort?: string }).reasoningEffort === 'low')).toBe(true)
    expect(saved[0]).toMatchObject({ provider: 'glm-codingplan', model: 'glm-5.3-flash', reasoningEffort: 'low' })
  })

  it('rejects levels the model does not declare', async () => {
    const { agent } = agentStub({})
    const out = await effortCommand.handler!({ agent, rawInput: 'medium' } as never)
    expect(out.kind).toBe('error')
    expect((out as { text: string }).text).toContain('low / high / max')
  })

  it('undeclared models now work off the inferred ladder (B-6 strategy)', async () => {
    const { agent } = agentStub({ declared: undefined, model: 'Qwen3.8-Flash', provider: 'scnet' })
    // No declaration anywhere: the name heuristic ('flash') yields low/high,
    // so 'high' applies instead of being rejected outright.
    const out = await effortCommand.handler!({ agent, rawInput: 'high' } as never)
    expect(out.kind).toBe('success')
    // 'max' is outside the inferred flash ladder -> still rejected.
    const outMax = await effortCommand.handler!({ agent, rawInput: 'max' } as never)
    expect(outMax.kind).toBe('error')
    expect((outMax as { text: string }).text).toContain('low / high')
  })

  it('bare /effort prints usage', async () => {
    const { agent } = agentStub({})
    const out = await effortCommand.handler!({ agent, rawInput: '' } as never)
    expect(out.kind).toBe('success')
    expect((out as { text: string }).text).toContain('usage:')
  })
})
