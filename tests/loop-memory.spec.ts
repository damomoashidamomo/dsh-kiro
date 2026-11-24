/**
 * 0.9.11 — the kiro-loop driver's conversation memory must follow session
 * switches.
 *
 * User report: after `/chat resume` the UI replayed the whole transcript (300+
 * events back on screen) but the model answered "这个会话里我们还没有执行过
 * 任何命令" — the replay only fed the TRANSCRIPT, never the driver's `history`,
 * so the model saw a conversation with zero past turns.
 *
 * Symmetrically, `/chat new` (and `/clear`) used to keep the previous
 * conversation in memory — a fresh session whose first turn leaks stale
 * context to the model.
 */

import { describe, it, expect } from 'vitest'
import { KiroLoopDriver } from '../src/runtime/kiro-loop'

function makeDriver(): KiroLoopDriver {
  return new KiroLoopDriver({
    ctx: {},
    llmPort: { async *stream() { /* never streamed in these tests */ } },
    toolsPort: undefined,
    controller: { ingestEvent: () => {} },
    systemPrompt: () => '',
    agentCtx: () => undefined,
    persona: () => undefined,
    approvalGate: async () => 'deny',
    permissionPreset: () => 'workspace-write',
  } as unknown as ConstructorParameters<typeof KiroLoopDriver>[0])
}

const TRANSCRIPT = [
  { kind: 'user', text: '帮我写一条 helm 命令' },
  { kind: 'assistant', text: 'helm get values <release> -n difyaas' },
  { kind: 'system', text: '↻ 网络抖动，已重试' },
  { kind: 'tool-call', text: 'helm get values …' },
  { kind: 'user', text: '谢谢' },
]

describe('kiro-loop conversation memory (0.9.11)', () => {
  it('seed() keeps only user/assistant turns — system and tool noise never reach the model', () => {
    const driver = makeDriver()
    driver.seed(TRANSCRIPT)
    expect(driver.memoryDepth).toBe(3)
  })

  it('seed() replaces (not appends) — repeated resume does not duplicate history', () => {
    const driver = makeDriver()
    driver.seed(TRANSCRIPT)
    driver.seed(TRANSCRIPT)
    expect(driver.memoryDepth).toBe(3)
  })

  it('reset() wipes memory, steering, trace and failure state', () => {
    const driver = makeDriver()
    driver.seed(TRANSCRIPT)
    driver.steer('插话')
    expect(driver.memoryDepth).toBe(3)
    expect(driver.trace().length).toBe(0) // nothing traced yet — baseline
    driver.reset()
    expect(driver.memoryDepth).toBe(0)
    expect(driver.lastTurnFailure).toBeUndefined()
  })

  it('re-seed after reset rebuilds the memory (resume → new → resume again)', () => {
    const driver = makeDriver()
    driver.seed(TRANSCRIPT)
    driver.reset()
    driver.seed(TRANSCRIPT.slice(0, 1))
    expect(driver.memoryDepth).toBe(1)
  })
})
