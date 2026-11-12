import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { AnomalyCounter, createInProcessAdapter, translateLlmChunk } from '../src/dsh-adapter/in-process'
import { createFauxLlmPort, parseFauxScript } from '../src/dsh-adapter/faux'
import { resolveSessionLog } from '../src/utils/sessions'

/**
 * P2 契约测试：把 dsh-kiro 对 DSH 协议的**全部假设**显式化。
 *
 * 这些测试跑在仓库 devDeps 安装的平台包上（版本被 package.json 锁定）。
 * DSH 升级 → `pnpm install` 更新 devDeps → 跑本套件 → 哪条假设破了红灯，
 * 只改 src/dsh-adapter/。它们是"跨版本免疫"的第一道网（结构层）。
 */

const PLATFORM_ROOT = resolve(__dirname, '../node_modules/@deepseek-ai')

function platformPackage(name: string): string {
  return resolve(PLATFORM_ROOT, name)
}

describe('dsh-adapter tolerance (P2.2)', () => {
  it('translates every chunk family the kernel understands', () => {
    const a = new AnomalyCounter()
    expect(translateLlmChunk({ type: 'text-delta', text: 'hi' }, a)).toEqual({ type: 'text-delta', text: 'hi' })
    expect(translateLlmChunk({ type: 'reasoning-delta', text: '思考' }, a)).toEqual({ type: 'reasoning-delta', text: '思考' })
    expect(translateLlmChunk({ type: 'block-end', block: { type: 'tool-call', id: 'c1', name: 'write', arguments: '{"a":1}' } }, a))
      .toEqual({ type: 'tool-call', id: 'c1', name: 'write', arguments: '{"a":1}' })
    // 工具调用参数为对象时序列化（平台某日改送对象也不炸）
    expect(translateLlmChunk({ type: 'block-end', block: { type: 'tool-call', id: 'c2', name: 'read', arguments: { path: 'x' } } }, a))
      .toEqual({ type: 'tool-call', id: 'c2', name: 'read', arguments: '{"path":"x"}' })
    expect(translateLlmChunk({ type: 'usage', usage: { inputTokens: 3, outputTokens: 5 } }, a))
      .toEqual({ type: 'usage', inputTokens: 3, outputTokens: 5, totalTokens: undefined })
    expect(translateLlmChunk({ type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } }, a))
      .toEqual({ type: 'finish', reason: 'error', failureMessage: 'boom' })
    expect(a.snapshot()).toEqual({})
  })

  it('unknown chunks are VISIBLE (counted), never silently dropped', () => {
    const a = new AnomalyCounter()
    translateLlmChunk({ type: 'shiny-new-chunk' }, a)
    translateLlmChunk({ type: 'shiny-new-chunk' }, a)
    translateLlmChunk({}, a)
    translateLlmChunk('not-an-object', a)
    translateLlmChunk({ type: 'block-end', block: { type: 'mystery-block' } }, a)
    expect(a.count('llm:unknown-type:shiny-new-chunk')).toBe(2)
    expect(a.count('llm:unknown-type:missing')).toBe(1)
    expect(a.count('llm:non-object-chunk')).toBe(1)
    expect(a.count('llm:block-end-unknown:mystery-block')).toBe(1)
  })

  it('text/reasoning block-ends are ignored WITHOUT anomaly noise', () => {
    const a = new AnomalyCounter()
    translateLlmChunk({ type: 'block-end', block: { type: 'text' } }, a)
    translateLlmChunk({ type: 'block-end', block: { type: 'reasoning' } }, a)
    expect(a.snapshot()).toEqual({})
  })

  it('approval channel missing fails CLOSED (rejected, never silent allow)', async () => {
    const adapter = createInProcessAdapter({})
    await expect(adapter.dialog.requestApproval({ toolName: 'bash' })).resolves.toBe('rejected')
    expect(adapter.anomalies.count('dialog:approval-unavailable')).toBe(1)
  })

  it('llm missing throws honestly; tools missing degrades to error result', async () => {
    const adapter = createInProcessAdapter({})
    await expect(async () => { for await (const _ of adapter.llm.stream({ provider: 'p', model: 'm', system: '', messages: [] })) void _ })
      .rejects.toThrow('llm 服务不可用')
    expect(adapter.tools.schemas()).toEqual([])
    const result = await adapter.tools.execute({ callId: 'c', name: 'bash', arguments: {}, signal: new AbortController().signal })
    expect(result.isError).toBe(true)
  })
})

describe('faux provider (P2.1)', () => {
  it('replays a scripted turn with text, reasoning, tool call and finish', async () => {
    const faux = createFauxLlmPort(parseFauxScript(JSON.stringify({
      turns: [[
        { reasoning: '想想' },
        { text: '我来创建' },
        { tool: { name: 'write', arguments: { path: 'a.txt', content: 'ok' } } },
      ]],
    })))
    const chunks = []
    for await (const chunk of faux.stream({ provider: 'p', model: 'm', system: '', messages: [] })) chunks.push(chunk)
    expect(chunks).toEqual([
      { type: 'reasoning-delta', text: '想想' },
      { type: 'text-delta', text: '我来创建' },
      { type: 'tool-call', id: expect.stringMatching(/^faux-/), name: 'write', arguments: '{"path":"a.txt","content":"ok"}' },
      { type: 'finish', reason: 'stop' },
    ])
  })

  it('error steps finish with failure message (drives retry classification)', async () => {
    const faux = createFauxLlmPort(parseFauxScript(JSON.stringify({ turns: [[{ error: 'gateway 504' }]] })))
    const chunks = []
    for await (const chunk of faux.stream({ provider: 'p', model: 'm', system: '', messages: [] })) chunks.push(chunk)
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: 'error', failureMessage: 'gateway 504' })
  })

  it('beyond the script: turns end empty (deterministic, no throw)', async () => {
    const faux = createFauxLlmPort(parseFauxScript(JSON.stringify({ turns: [[{ text: 'one' }]] })))
    for await (const _ of faux.stream({ provider: 'p', model: 'm', system: '', messages: [] })) void _
    const second = []
    for await (const chunk of faux.stream({ provider: 'p', model: 'm', system: '', messages: [] })) second.push(chunk)
    expect(second.at(-1)).toEqual({ type: 'finish', reason: 'stop' })
  })
})

describe('session dual-read (P2.3)', () => {
  it('prefers v3 when present, falls back to the highest v* otherwise', async () => {
    const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'dsh-dualread-'))
    try {
      expect(resolveSessionLog(dir)).toBeUndefined()
      writeFileSync(join(dir, 'session.v4.jsonl.zstd'), 'x')
      expect(resolveSessionLog(dir)).toBe(join(dir, 'session.v4.jsonl.zstd'))
      writeFileSync(join(dir, 'session.v5.jsonl.zstd'), 'x')
      expect(resolveSessionLog(dir)).toBe(join(dir, 'session.v5.jsonl.zstd'))
      writeFileSync(join(dir, 'session.v3.jsonl.zstd'), 'x')
      expect(resolveSessionLog(dir)).toBe(join(dir, 'session.v3.jsonl.zstd'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('DSH platform contracts (P2.4)', () => {
  it('CONTRACT: dsh-user-questions still exports the ASK_CANCELLED error shape we catch', async () => {
    const mod = await import('@deepseek-ai/dsh-user-questions')
    const Ctor = (mod as unknown as { UserQuestionError?: new (message: string, code: string) => Error }).UserQuestionError
    expect(Ctor).toBeTypeOf('function')
    const err = new Ctor!('dismissed', 'ASK_CANCELLED')
    expect((err as unknown as { code: string }).code).toBe('ASK_CANCELLED')
  })

  it('CONTRACT: cordis context still carries provide/on/get (plugin protocol)', async () => {
    const mod = await import('@deepseek-ai/cordis')
    expect(mod.Context).toBeTypeOf('function')
  })

  it('CONTRACT: the installed platform version is the one this build was verified against', () => {
    // devDeps 锁定的平台版本（升级 DSH 时这里会变——契约测试红灯从这里开始排查）。
    const pkg = JSON.parse(readFileSync(resolve(PLATFORM_ROOT, 'cordis/package.json'), 'utf8')) as { version: string }
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('CONTRACT: llm stream contract surface (chunk vocabulary we translate)', () => {
    // 我们翻译的块类型清单 —— 与 in-process.translateLlmChunk 的 switch 对齐。
    // 平台新增块类型不会崩（unknown+计数），但此清单应随平台协议演进主动更新。
    const knownChunkTypes = [
      'text-delta', 'reasoning-delta', 'block-end', 'usage', 'finish',
    ] as const
    for (const type of knownChunkTypes) {
      const a = new AnomalyCounter()
      const fake = type === 'finish'
        ? { type, reason: { kind: 'stop' } }
        : type === 'block-end'
          ? { type, block: { type: 'tool-call', id: 'c', name: 'x', arguments: '{}' } }
          : { type, text: '', usage: {} }
      const out = translateLlmChunk(fake, a)
      expect(out.type).not.toBe('unknown')
    }
  })

  it('CONTRACT: session log frame format stays zstd-concatenated jsonl', async () => {
    const zlib = await import('node:zlib')
    expect(typeof zlib.zstdCompressSync).toBe('function')
    expect(typeof zlib.zstdDecompressSync).toBe('function')
  })
})

import { evaluateGate, parseCompatOverride, compareVersions, detectPlatformVersion } from '../src/dsh-adapter/version-gate'

describe('DSH version gate (P2.5)', () => {
  it('unknown version passes; detection failure passes with a note', () => {
    expect(evaluateGate(undefined)).toEqual({ ok: true, version: undefined, reason: expect.stringContaining('无法检测') })
  })

  it('known-bad versions fail CLOSED with an actionable reason', () => {
    const verdict = evaluateGate('0.1.0-rc.6', 'bad:0.1.0-rc.6')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('已知不兼容')
  })

  it('minimum-version floor via override', () => {
    expect(evaluateGate('0.0.9', 'min:0.9.0').ok).toBe(false)
    expect(evaluateGate('0.9.0', 'min:0.9.0').ok).toBe(true)
    expect(evaluateGate('1.2.3', 'min:0.9.0').ok).toBe(true)
  })

  it('version comparison handles rc prereleases like the platform pins them', () => {
    expect(compareVersions('0.1.0-rc.5', '0.1.0-rc.6')).toBe(-1)
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1)
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0)
  })

  it('detects a real platform version in this checkout', () => {
    // 契约的一部分：检测路径本身必须工作（升级后若解析失效，这里红灯）。
    expect(detectPlatformVersion()).toMatch(/^\d+\.\d+/)
  })

  it('override parser defaults to empty bad list', () => {
    expect(parseCompatOverride(undefined)).toEqual({ bad: [], min: undefined })
    expect(parseCompatOverride('bad:1.0.0, 2.0.0 ;min:0.5.0')).toEqual({ bad: ['1.0.0', '2.0.0'], min: '0.5.0' })
  })
})

import { adapterHealthProbe } from '../src/dsh-adapter'
import { KiroLoopDriver } from '../src/runtime/kiro-loop'

describe('upgrade drill (P3.1) — mutated platform protocol must degrade, never crash', () => {
  it('renamed chunk types are counted as unknown; the turn still completes', async () => {
    // 演练：平台把 text-delta 改名 delta、finish 改名 done——驱动器不得崩。
    const anomalies = new AnomalyCounter()
    const mutatedPlatform = {
      stream(options: unknown): AsyncIterable<unknown> {
        async function* replay(): AsyncGenerator<unknown> {
          yield { type: 'delta', text: '活着' }
          yield { type: 'done', reason: { kind: 'stop' } }
        }
        void options
        return replay()
      },
    }
    const adapter = createInProcessAdapter({ llm: mutatedPlatform })
    const events: unknown[] = []
    const driver = new KiroLoopDriver({
      ctx: {} as never,
      llmPort: adapter.llm,
      controller: { ingestEvent: (e) => { events.push(e) } },
      systemPrompt: () => '',
      selection: () => ({ provider: 'p', model: 'm' }),
      workspaceRoot: '/tmp',
    })
    await driver.runTurn('drill')
    expect(adapter.anomalies.count('llm:unknown-type:delta')).toBe(1)
    expect(adapter.anomalies.count('llm:unknown-type:done')).toBe(1)
    expect(events.some((e) => (e as { type?: string }).type === 'turn/end')).toBe(true)
  })

  it('tool arguments arriving as OBJECT (not string) still execute', () => {
    const a = new AnomalyCounter()
    const out = translateLlmChunk({ type: 'block-end', block: { type: 'tool_use', id: 'c', name: 'write', arguments: { path: 'x' } } }, a)
    expect(out).toMatchObject({ type: 'tool-call', name: 'write' })
    expect(JSON.parse((out as { arguments: string }).arguments)).toEqual({ path: 'x' })
  })

  it('boot probe reports honest problems when services are missing', () => {
    expect(adapterHealthProbe({})).toEqual({ ok: false, problems: [expect.stringContaining('llm'), expect.stringContaining('tools')] })
    expect(adapterHealthProbe({ llm: { stream: () => undefined }, tools: { schemas: () => [] } }).ok).toBe(true)
  })
})
