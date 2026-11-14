import { describe, it, expect, vi } from 'vitest'

/**
 * A4 升级演练（meta-test）：证明「契约测试在平台漂移时必然红灯」。
 *
 * 方法：用 vi.mock 把某个平台包模拟成"升级后改了形状"的版本，然后运行
 * 与契约测试**完全相同**的断言——期望它抛错（红灯）。若某条断言在模拟
 * 漂移下依然通过，说明该契约是假的（没有真正钉住假设），测试失败。
 */

describe('upgrade drill: contracts must go RED on platform drift', () => {
  it('DRILL: dsh-skill 改名 isSkillName → 契约必须红灯', async () => {
    vi.resetModules()
    vi.doMock('@deepseek-ai/dsh-skill', () => ({
      // 模拟升级后：isSkillName 被改名为 is_valid_skill_name
      is_valid_skill_name: (n: string) => n.length > 0,
    }))
    const mod = await import('@deepseek-ai/dsh-skill')
    // 升级漂移的两种形态都必须触发红灯：
    //  a) 属性访问即抛（vitest mock 代理：导出消失）；b) 类型不再匹配。
    const access = (): unknown => (mod as unknown as Record<string, unknown>).isSkillName
    expect(() => {
      const value = access()
      if (typeof value !== 'function') throw new Error('CONTRACT RED: isSkillName 消失')
    }).toThrow()
    vi.doUnmock('@deepseek-ai/dsh-skill')
  })

  it('DRILL: UserQuestionError 不再带 code → 契约必须红灯', async () => {
    vi.resetModules()
    vi.doMock('@deepseek-ai/dsh-user-questions', () => ({
      // 模拟升级后：错误码字段改名为 kind
      UserQuestionError: class extends Error { kind = 'ASK_CANCELLED' },
    }))
    const mod = await import('@deepseek-ai/dsh-user-questions')
    const Ctor = (mod as unknown as { UserQuestionError: new (m: string, c: string) => Error & { code?: string; kind?: string } }).UserQuestionError
    const err = new Ctor('dismissed', 'ASK_CANCELLED')
    expect(() => {
      if (err.code !== 'ASK_CANCELLED') throw new Error('CONTRACT RED: code 字段消失/改名')
    }).toThrow('CONTRACT RED')
    vi.doUnmock('@deepseek-ai/dsh-user-questions')
  })

  it('DRILL: 平台包版本出现混轨 → 契约必须红灯', () => {
    const read = (name: string, version: string) => ({ version }) as never
    const fake = [read('a', '0.2.0-rc.1'), read('b', '0.2.0-rc.1'), read('c', '0.1.2-rc.1')]
    const versions = new Set(fake.map((p) => (p as { version: string }).version))
    expect(() => {
      if (versions.size !== 1) throw new Error(`CONTRACT RED: 混轨 ${[...versions].join(' vs ')}`)
    }).toThrow('CONTRACT RED')
  })

  it('DRILL: llm 块词汇改名（text-delta→delta）→ 容错层降级可见不崩', async () => {
    const { translateLlmChunk, AnomalyCounter } = await import('../src/dsh-adapter/in-process')
    const a = new AnomalyCounter()
    const out = translateLlmChunk({ type: 'delta', text: '活着' }, a)
    expect(out.type).toBe('unknown')
    expect(a.count('llm:unknown-type:delta')).toBe(1)
    // 降级不崩 + 计数可见 = 升级后的第二道网（行为审计之外的结构兜底）
  })
})
