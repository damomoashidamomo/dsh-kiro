import { describe, it, expect } from 'vitest'
import { summaryOf, resumeHint, PICKER_SESSIONS } from '../src/commands/chat'

/**
 * Rows that could not show a 简介 were command-only sessions: no title event
 * and no user message at all, so they fell back to a bare timestamp that told
 * sessions apart only by the minute they started.
 */

describe('session row summary', () => {
  it('prefers the durable title', () => {
    expect(summaryOf({ title: '登录重构', firstUser: '帮我重构登录', commands: ['/chat list'] })).toBe('登录重构')
  })

  it('falls back to the first user message', () => {
    expect(summaryOf({ title: '', firstUser: '当前进度确认', commands: ['/chat list'] })).toBe('当前进度确认')
  })

  it('names the commands when the session never got a message', () => {
    expect(summaryOf({ title: '', firstUser: '', commands: ['/chat list', '/model'] })).toBe('命令 /chat list · /model')
  })

  it('is empty when the session has nothing to say', () => {
    expect(summaryOf({ title: '', firstUser: '', commands: [] })).toBe('')
  })

  it('clips a long summary', () => {
    const long = summaryOf({ title: '', firstUser: '很'.repeat(80), commands: [] })
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('/chat resume hint', () => {
  it('points at the table and the menu instead of repeating the listing', () => {
    const hint = resumeHint()
    expect(hint).toContain('/chat resume <session-id>')
    expect(hint).toContain('/chat list')
    expect(hint).toContain(String(PICKER_SESSIONS))
    // No second list of sessions: the table from /chat list is the listing.
    expect(hint).not.toContain('session-0')
    expect(hint.split('\n')).toHaveLength(2)
  })
})
