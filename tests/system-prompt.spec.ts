/**
 * 0.9.10 — the built-in guardrail must sit at the TOP of the kiro-loop system
 * prompt, ahead of persona / skills catalog / steering.
 *
 * Why: a real model (volcengine ark-code-latest) kept emitting 200-column
 * one-liners although the ≤90-column rule was already in the prompt — it was
 * appended after persona + 30 skill entries + steering, where attention decays.
 * Order is a behavioural lever here, so it is pinned rather than left implicit.
 */

import { describe, it, expect } from 'vitest'
import { composeKiroSystemPrompt } from '../src/runtime/system-prompt'
import { GUARDRAIL_TEXT } from '../src/guardrail'

const SKILLS = [
  { name: 'alpha', description: 'first skill' },
  { name: 'beta', description: 'second skill' },
]

describe('kiro-loop system prompt assembly', () => {
  it('places the guardrail before persona, skills and steering', () => {
    const prompt = composeKiroSystemPrompt({
      cwd: '/work',
      persona: { name: 'reviewer', prompt: 'persona body text' },
      skills: SKILLS,
      steering: '## steering section title',
    })
    const guard = prompt.indexOf(GUARDRAIL_TEXT)
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(prompt.indexOf('persona body text'))
    expect(guard).toBeLessThan(prompt.indexOf('alpha：first skill'))
    expect(guard).toBeLessThan(prompt.indexOf('## steering section title'))
  })

  it('keeps the guardrail inside the first ~1.2k chars (not buried in a long tail)', () => {
    const prompt = composeKiroSystemPrompt({
      cwd: '/work',
      persona: { name: 'reviewer', prompt: 'x'.repeat(4000) },
      skills: SKILLS,
      steering: 'y'.repeat(4000),
    })
    // 身份两行 + 护栏：护栏正文必须在提示的前段
    expect(prompt.indexOf('单行不得超过 90 列')).toBeLessThan(1200)
  })

  it('carries the hard ≤90-column requirement and the multi-line escape hatch', () => {
    const prompt = composeKiroSystemPrompt({ cwd: '/work' })
    expect(prompt).toContain('不得超过 90 列')
    expect(prompt).toContain('真·多行脚本')
    expect(prompt).toContain('禁止用分号')
  })

  it('emits only the identity lines + guardrail when nothing else exists', () => {
    const prompt = composeKiroSystemPrompt({ cwd: '/work' })
    expect(prompt.startsWith('You are a coding agent running inside the Kiro TUI')).toBe(true)
    expect(prompt).toContain('Your working directory is /work.')
    expect(prompt).not.toContain('## 当前智能体预设')
    expect(prompt).not.toContain('## 可用技能目录')
  })

  it('omits empty persona / skill / steering sections without blank artifacts', () => {
    const withEmpty = composeKiroSystemPrompt({
      cwd: '/work',
      persona: { name: 'blank', prompt: '   ' },
      skills: [],
      steering: '',
    })
    const bare = composeKiroSystemPrompt({ cwd: '/work' })
    expect(withEmpty).toBe(bare)
    expect(bare.endsWith('\n')).toBe(false)
  })
})
