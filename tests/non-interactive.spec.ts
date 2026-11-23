/**
 * 0.9.10 — `--no-interactive` prints the answer (it used to print nothing).
 *
 * The A3 headless fallback spawns `dsh --profile kiro --no-interactive "<task>"`
 * and treats stdout as the model reply, so an empty stdout made the fallback
 * fail on every call while still exiting 0 — a silent dead escape hatch.
 */

import { describe, it, expect } from 'vitest'
import {
  collectNonInteractiveReport,
  formatNonInteractiveReport,
  nonInteractiveFailed,
  nonInteractiveFailureLines,
} from '../src/runtime/non-interactive'
import type { Message } from '../src/runtime/types'

function msg(kind: Message['kind'], text: string, extra: Partial<Message> = {}): Message {
  return {
    id: `${kind}-1`,
    kind,
    text,
    tool: undefined,
    createdAt: 0,
    seq: 0,
    usage: undefined,
    streaming: false,
    ...extra,
  } as Message
}

const TOOL = {
  id: 'call-1',
  callId: 'call-1',
  argsRaw: '{}',
  argsPreview: '{}',
  state: 'done' as const,
  output: 'ok',
  outputSpillPath: undefined,
  durationMs: 3,
  metadata: {},
}

describe('non-interactive output (0.9.10)', () => {
  it('collects only assistant text, in order, and joins settled segments', () => {
    const report = collectNonInteractiveReport([
      msg('user', '查看 helm values'),
      msg('reasoning', '先想一想'),
      msg('assistant', '第一段'),
      msg('tool-call', '', { tool: { ...TOOL, name: 'bash' } }),
      msg('system', '[notice] hooked'),
      msg('assistant', '第二段'),
    ])
    expect(report.text).toBe('第一段\n\n第二段')
    expect(report.errors).toEqual([])
    expect(report.toolCalls).toEqual([{ name: 'bash', state: 'done' }])
  })

  it('plain format prints the answer alone plus one trailing newline', () => {
    const out = formatNonInteractiveReport({ text: '命令在此', toolCalls: [], errors: [] }, 'plain')
    expect(out).toBe('命令在此\n')
  })

  it('plain format prints nothing when there is no answer', () => {
    expect(formatNonInteractiveReport({ text: '', toolCalls: [], errors: [] }, 'plain')).toBe('')
  })

  it('json format carries text, toolCalls and errors', () => {
    const out = formatNonInteractiveReport(
      { text: 'ok', toolCalls: [{ name: 'bash', state: 'done' }], errors: [] },
      'json',
    )
    expect(out.endsWith('\n')).toBe(true)
    expect(JSON.parse(out)).toEqual({ text: 'ok', toolCalls: [{ name: 'bash', state: 'done' }], errors: [] })
  })

  it('json-pretty is indented and parses to the same payload', () => {
    const report = { text: 'ok', toolCalls: [] as const, errors: [] as const }
    const pretty = formatNonInteractiveReport({ ...report, toolCalls: [], errors: [] }, 'json-pretty')
    expect(pretty).toContain('\n  "text"')
    expect(JSON.parse(pretty)).toEqual({ text: 'ok', toolCalls: [], errors: [] })
  })

  it('surfaces error messages so a failed turn is diagnosable (and exit is non-zero)', () => {
    const report = collectNonInteractiveReport([msg('error', 'provider 401')])
    expect(report.text).toBe('')
    expect(report.errors).toEqual(['provider 401'])
    // 空回答 + 有错误 → 运行时写 stderr 并以退出码 1 结束
    expect(report.text === '' && report.errors.length > 0).toBe(true)
  })
})

describe('non-interactive failure signalling (0.9.10)', () => {
  it('a driver-level turn failure makes plain output empty and the exit non-zero', () => {
    const report = collectNonInteractiveReport([msg('user', '查看 pod')], '429: 已达到 5 小时使用上限')
    expect(report.text).toBe('')
    expect(report.failure).toBe('429: 已达到 5 小时使用上限')
    expect(formatNonInteractiveReport(report, 'plain')).toBe('')
    expect(nonInteractiveFailed(report)).toBe(true)
    expect(nonInteractiveFailureLines(report)).toEqual(['429: 已达到 5 小时使用上限'])
  })

  it('carries the failure into the JSON payload', () => {
    const report = collectNonInteractiveReport([], 'provider 401')
    expect(JSON.parse(formatNonInteractiveReport(report, 'json'))).toEqual({
      text: '', failure: 'provider 401', toolCalls: [], errors: [],
    })
  })

  it('an answered turn never exits non-zero, even with a failure string present', () => {
    const report = collectNonInteractiveReport([msg('assistant', '命令：kubectl get pod')], 'partial stream warning')
    expect(nonInteractiveFailed(report)).toBe(false)
  })

  it('a silent turn with no failure is not an error (just empty)', () => {
    const report = collectNonInteractiveReport([])
    expect(nonInteractiveFailed(report)).toBe(false)
    expect(report.failure).toBeUndefined()
  })
})
