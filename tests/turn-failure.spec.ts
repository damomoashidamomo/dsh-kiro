/**
 * B-9 — turn-failure classification (actionable hints instead of a bare
 * "Request timed out") and the /retry resubmission command.
 */

import { describe, it, expect } from 'vitest'
import { classifyTurnFailure } from '../src/runtime/turn-failure'
import { retryCommand } from '../src/commands/retry'

describe('classifyTurnFailure', () => {
  it('maps timeouts to a retry/backoff hint naming /retry and /model', () => {
    const hint = classifyTurnFailure({ message: 'Request timed out' }, 'Request timed out')
    expect(hint.kind).toBe('timeout')
    expect(hint.transient).toBe(true)
    expect(hint.text).toContain('超时')
    expect(hint.text).toContain('/retry')
    expect(hint.text).toContain('/model')
  })

  it('maps 429 to rate-limit with the provider-requested backoff', () => {
    const hint = classifyTurnFailure(
      { message: 'Too Many Requests', code: 'rate_limited', status: 429, providerRetryAfterMs: 12000 },
      'Too Many Requests',
    )
    expect(hint.kind).toBe('rate-limit')
    expect(hint.text).toContain('限流')
    expect(hint.text).toContain('12s')
  })

  it('maps 5xx to the server class with /model advice', () => {
    const hint = classifyTurnFailure({ message: 'Bad Gateway', status: 502 }, 'Bad Gateway')
    expect(hint.kind).toBe('server')
    expect(hint.text).toContain('502')
    expect(hint.text).toContain('/model')
  })

  it('maps 401 to the auth class and points at the API key', () => {
    const hint = classifyTurnFailure({ message: 'Unauthorized', status: 401 }, 'Unauthorized')
    expect(hint.kind).toBe('auth')
    expect(hint.text).toContain('apiKeyEnv')
  })

  it('maps connection failures to the network class', () => {
    const hint = classifyTurnFailure({ message: 'fetch failed: ECONNREFUSED' }, 'fetch failed: ECONNREFUSED')
    expect(hint.kind).toBe('network')
    expect(hint.text).toContain('网络')
  })

  it('maps unknown model ids to the model class', () => {
    const hint = classifyTurnFailure({ message: 'model not found: nope' }, 'model not found: nope')
    expect(hint.kind).toBe('model')
    expect(hint.text).toContain('/model')
  })

  it('falls through to a generic hint that still offers /retry', () => {
    const hint = classifyTurnFailure(undefined, 'something odd')
    expect(hint.kind).toBe('unknown')
    expect(hint.text).toContain('/retry')
  })
})

describe('/retry', () => {
  const run = (agent: unknown) => retryCommand.handler({ agent, rawInput: '' } as never)

  it('resubmits the last user prompt through the service', async () => {
    const submitted: string[] = []
    const result = await run({
      ctx: {
        get: (name: string): unknown =>
          name === 'kiroRetry'
            ? {
                lastUserPrompt: () => '帮我看看天气',
                submit: (t: string) => { submitted.push(t) },
              }
            : undefined,
      },
    })
    expect(result.kind).toBe('success')
    expect(submitted).toEqual(['帮我看看天气'])
    expect(result.text).toContain('已重发')
  })

  it('errors when there is nothing to resend', async () => {
    const result = await run({
      ctx: { get: () => ({ lastUserPrompt: () => undefined, submit: () => {} }) },
    })
    expect(result.kind).toBe('error')
    expect(result.text).toContain('没有可重发')
  })

  it('errors when the service is unavailable', async () => {
    const result = await run({ ctx: { get: () => undefined } })
    expect(result.kind).toBe('error')
    expect(result.text).toContain('不可用')
  })
})
