/**
 * B-6 general effort strategy: the level ladder resolves model > provider >
 * name-heuristic, /effort accepts inferred ladders with honest provenance,
 * and rejected effort fields get their own failure class.
 */

import { describe, it, expect } from 'vitest'
import { inferEffortLevels, resolveEffortLevels, effortSourceLabel } from '../src/runtime/effort-levels'
import { classifyTurnFailure } from '../src/runtime/turn-failure'

const catalog = {
  providers: {
    'glm-codingplan': {
      reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
      models: [
        { id: 'glm-5.3', reasoningEfforts: { low: 'low' } },
        { id: 'glm-5.3-air' },
      ],
    },
  },
}

describe('resolveEffortLevels ladder', () => {
  it('model declaration wins over the provider default', () => {
    const r = resolveEffortLevels(catalog as never, 'glm-codingplan', 'glm-5.3')
    expect(r?.levels).toEqual(['low'])
    expect(r?.source).toBe('model')
  })

  it('provider default covers models without their own entry', () => {
    const r = resolveEffortLevels(catalog as never, 'glm-codingplan', 'glm-5.3-air')
    expect(r?.levels).toEqual(['low', 'high', 'max'])
    expect(r?.source).toBe('provider')
  })

  it('unknown providers fall back to the name heuristic, marked inferred', () => {
    const r = resolveEffortLevels(catalog as never, 'scnet-model-service', 'DeepSeek-V4.1-Flash-1017')
    expect(r?.source).toBe('inferred')
    expect(r?.levels.length).toBeGreaterThan(0)
  })

  it('returns undefined without ids', () => {
    expect(resolveEffortLevels(catalog as never, undefined, 'x')).toBeUndefined()
    expect(resolveEffortLevels(catalog as never, 'p', undefined)).toBeUndefined()
  })
})

describe('inferEffortLevels heuristics', () => {
  it('reasoning-flagship names get the full ladder', () => {
    expect(inferEffortLevels('deepseek-r1')).toEqual(['low', 'high', 'max'])
    expect(inferEffortLevels('gpt-o3-mini')).toEqual(['low', 'high', 'max'])
  })

  it('flash/lite variants get a conservative low/high ladder', () => {
    expect(inferEffortLevels('DeepSeek-V4.1-Flash-1017')).toEqual(['low', 'high'])
    expect(inferEffortLevels('glm-air')).toEqual(['low', 'high'])
  })

  it('unknown names default to the standard ladder', () => {
    expect(inferEffortLevels('some-model')).toEqual(['low', 'high', 'max'])
  })
})

describe('effortSourceLabel', () => {
  it('labels each provenance', () => {
    expect(effortSourceLabel('model')).toContain('模型声明')
    expect(effortSourceLabel('provider')).toContain('Provider')
    expect(effortSourceLabel('inferred')).toContain('推断')
  })
})

describe('rejected effort fields (failure classification)', () => {
  it('reasoning_effort rejections get the effort-field class and auto advice', () => {
    const hint = classifyTurnFailure(
      { message: 'Invalid parameter: reasoning_effort', code: 'invalid_request' },
      'Invalid parameter: reasoning_effort',
    )
    expect(hint.kind).toBe('effort-field')
    expect(hint.text).toContain('/effort auto')
    expect(hint.text).toContain('probe')
  })

  it('thinking-field rejections map to the same class', () => {
    const hint = classifyTurnFailure(
      { message: 'thinking is not supported by this model' },
      'thinking is not supported by this model',
    )
    expect(hint.kind).toBe('effort-field')
  })
})
