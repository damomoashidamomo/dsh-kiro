import { describe, it, expect } from 'vitest'
import { PICKER_SESSIONS, chatListBridge, chatTitlesBridge } from '../src/commands/chat'

/**
 * The /chat option menu used to hand back `title: ''` for every row, so the
 * menu always said 「（无简介）」 while `/chat list` showed real titles. These
 * tests pin the two halves: the sync bridge (id + timestamp fallback) and the
 * async title loader (session/title event, then first user message).
 */

interface FakeEvent {
  readonly type: string
  readonly data: unknown
}

/** A runtime ctx exposing `kiroSessionReader`, the shape loadTitles expects. */
function fakeCtx(sessions: Record<string, readonly FakeEvent[]>): unknown {
  return {
    get: (key: string) => (key === 'kiroSessionReader'
      ? { readSession: async (id: string) => ({ events: sessions[id] ?? [] }) }
      : undefined),
  }
}

const userMessage = (text: string): FakeEvent => ({
  type: 'user/message',
  data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
})

describe('chat sessions bridge', () => {
  it('prefers the platform session/title event', async () => {
    const titles = await chatTitlesBridge(
      fakeCtx({ a: [{ type: 'session/title', data: { title: '重构登录流程' } }, userMessage('旧的首条消息')] }),
      ['a'],
    )
    expect(titles.get('a')).toBe('重构登录流程')
  })

  it('falls back to the first user message when no title exists', async () => {
    const titles = await chatTitlesBridge(fakeCtx({ b: [userMessage('  帮我把\n表格对齐  ')] }), ['b'])
    expect(titles.get('b')).toBe('帮我把 表格对齐')
  })

  it('returns no entry for an empty or unreadable session', async () => {
    const titles = await chatTitlesBridge(fakeCtx({ c: [] }), ['c', 'missing'])
    expect(titles.size).toBe(0)
  })

  it('does not throw when the reader is unavailable', async () => {
    const titles = await chatTitlesBridge({ get: () => undefined }, ['a'])
    expect(titles.size).toBe(0)
  })

  it('gives every listed row an id and a timestamp, and reports the total', () => {
    const listing = chatListBridge()
    expect(listing.sessions.length).toBeLessThanOrEqual(PICKER_SESSIONS)
    expect(listing.total).toBeGreaterThanOrEqual(listing.sessions.length)
    for (const row of listing.sessions) {
      expect(row.id).not.toBe('')
      expect(row.when).not.toBe('')
    }
  })
})

describe('withSessionTitles', () => {
  it('replaces the timestamp hint of a session row with its title', async () => {
    const { withSessionTitles } = await import('../src/ui/OptionMenu')
    const options = [
      { value: 'list', label: 'list', hint: '列出会话' },
      { value: 'resume abc123', label: 'abc123', hint: '2026-11-05 15:47' },
      { value: 'resume keep', label: 'keep', hint: '2026-11-05 16:00' },
      { value: 'help', label: 'help', hint: '用法说明' },
    ]
    const patched = withSessionTitles(options, new Map([['abc123', '重构登录流程']]))
    expect(patched[1]?.hint).toBe('重构登录流程')
    // A session with no title keeps its timestamp; other rows are untouched.
    expect(patched[2]?.hint).toBe('2026-11-05 16:00')
    expect(patched[0]?.hint).toBe('列出会话')
    expect(patched[3]?.hint).toBe('用法说明')
  })
})
