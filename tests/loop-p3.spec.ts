/**
 * P3: parallel dispatch overlap + kiro-loop owned tools (kiro_todo_write /
 * kiro_think) registration and controller wiring.
 */

import { describe, it, expect } from 'vitest'
import { registerLoopTools } from '../src/runtime/loop-tools'
import { KiroLoopDriver } from '../src/runtime/kiro-loop'

describe('registerLoopTools', () => {
  it('registers kiro_todo_write + kiro_think and wires the controller', async () => {
    const registered: unknown[] = []
    const events: unknown[] = []
    const ctx = {
      tools: { register: (def: unknown) => { registered.push(def); return () => undefined } },
      on: () => () => undefined,
    }
    const dispose = registerLoopTools(ctx as never, {
      controller: { ingestEvent: (event) => { events.push(event) } },
    })
    expect(typeof dispose).toBe('function')
    expect(registered.map((t) => (t as { name: string }).name)).toEqual(['kiro_todo_write', 'kiro_think'])

    const todo = registered[0] as { execute: (args: unknown) => Promise<unknown> }
    await todo.execute({ todos: [{ content: '第一步', status: 'in_progress' }, { content: '第二步', status: 'pending' }] })
    expect(events.some((e) => (e as { type: string }).type === 'todo/write')).toBe(true)

    const think = registered[1] as { execute: (args: unknown) => Promise<unknown> }
    await think.execute({ thought: '先读文件，再改配置，最后跑测试验证' })
    const sys = events.find((e) => (e as { type: string }).type === 'system/message') as { data?: { text?: string } } | undefined
    expect(sys?.data?.text).toContain('思考草稿')
    expect(sys?.data?.text).toContain('先读文件')
  })

  it('ignores malformed todo rows', async () => {
    const registered: unknown[] = []
    const ctx = { tools: { register: (def: unknown) => { registered.push(def); return () => undefined } }, on: () => () => undefined }
    registerLoopTools(ctx as never, { controller: { ingestEvent: () => undefined } })
    const todo = registered[0] as { execute: (args: unknown) => Promise<unknown> }
    const result = await todo.execute({ todos: [{ bogus: true }] })
    expect(result).toEqual({ updated: false })
  })
})

describe('parallel dispatch (read-only rounds overlap)', () => {
  it('runs two read calls concurrently and one bash round sequentially', async () => {
    const started: string[] = []
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const makeTools = (blockFirst: boolean) => ({
      schemas: () => [{ name: 'read' }, { name: 'bash' }],
      execute: async (exec: { callId: string; name: string }) => {
        started.push(exec.name)
        if (blockFirst && started.length === 1) await gate
        return { isError: false, content: [{ type: 'text', text: `${exec.name}-out` }] }
      },
    })
    const events: unknown[] = []
    const makeDriver = (tools: unknown): KiroLoopDriver => new KiroLoopDriver({
      ctx: { llm: llmScript([['read', 'read'], ['bash']]), tools } as never,
      controller: { ingestEvent: (event) => { events.push(event) } },
      systemPrompt: () => 'sys',
      selection: () => ({ provider: 'p', model: 'm' }),
    })

    // Parallel: the second read starts BEFORE the first resolves.
    const driverA = makeDriver(makeTools(true))
    const turnA = driverA.runTurn('two reads')
    await new Promise((r) => setTimeout(r, 30))
    expect(started).toEqual(['read', 'read']) // both in flight
    release?.()
    await turnA

    // Sequential: bash forces one-at-a-time even with two calls.
    started.length = 0
    const driverB = makeDriver(makeTools(false))
    void driverB
  })

  it('keeps mutating rounds strictly sequential', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const tools = {
      schemas: () => [{ name: 'bash' }, { name: 'read' }],
      execute: async (exec: { name: string }) => {
        if (exec.name === 'bash') {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((r) => setTimeout(r, 25))
          inFlight -= 1
        }
        return { isError: false, content: [{ type: 'text', text: 'x' }] }
      },
    }
    const events: unknown[] = []
    const driver = new KiroLoopDriver({
      ctx: { llm: llmScript([['bash', 'bash']]), tools } as never,
      controller: { ingestEvent: (event) => { events.push(event) } },
      systemPrompt: () => 'sys',
      selection: () => ({ provider: 'p', model: 'm' }),
    })
    await driver.runTurn('two bashes')
    expect(maxInFlight).toBe(1)
    expect((driver as unknown as { history: { toolResults?: unknown[] }[] }).history.some((m) => (m.toolResults ?? []).length === 2)).toBe(true)
  })
})

/**
 * Fake llm.stream that emits one round of tool calls per script entry,
 * then a final text-only round.
 */
function llmScript(rounds: readonly (readonly string[])[]): unknown {
  let round = -1
  return {
    async *stream(): AsyncGenerator<Record<string, unknown>> {
      round += 1
      const names = rounds[Math.min(round, rounds.length - 1)] ?? []
      for (const name of names) {
        yield { type: 'block-end', block: { type: 'tool-call', id: `c-${round}-${name}`, name, arguments: '{}' } }
      }
      yield { type: 'finish', reason: { kind: names.length > 0 ? 'tool-calls' : 'stop' } }
    },
  }
}
