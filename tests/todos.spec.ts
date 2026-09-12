import { describe, it, expect } from 'vitest'
import { todoCommand } from '../src/commands/todos'

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** Minimal duck-typed Session: an append-only event list + last-todo accessor. */
function fakeSession(seed: TodoItem[] | null = null, id = 'session-current'): {
  id: string
  ownEvents: () => Array<{ type: string; data: { todos: TodoItem[] } }>
  append: (type: string, data: { todos: TodoItem[] }) => void
  lastTodos: () => TodoItem[] | null
} {
  const events: Array<{ type: string; data: { todos: TodoItem[] } }> = []
  if (seed !== null) events.push({ type: 'todo/write', data: { todos: seed } })
  return {
    id,
    ownEvents: () => events.slice(),
    append: (type, data) => {
      events.push({ type, data })
    },
    lastTodos: () => {
      const writes = events.filter((e) => e.type === 'todo/write')
      return writes.length === 0 ? null : writes[writes.length - 1]!.data.todos
    },
  }
}

function agentWith(session: unknown, sessionsList: unknown[] = []): unknown {
  return {
    session,
    ctx: {
      get: (key: string) => (key === 'sessions' ? { list: () => sessionsList } : undefined),
    },
  }
}

async function run(input: string, agent: unknown): Promise<string> {
  const outcome = await todoCommand.handler({ agent, rawInput: input })
  return String(outcome?.text ?? '')
}

describe('/todos command', () => {
  it('shows an empty state when no list has been written', async () => {
    const text = await run('view', agentWith(fakeSession(null)))
    expect(text).toContain('no todos yet')
  })

  it('renders the current list with counts', async () => {
    const session = fakeSession([
      { content: 'write docs', status: 'pending' },
      { content: 'review PR', status: 'in_progress' },
      { content: 'ship release', status: 'completed' },
    ])
    const text = await run('', agentWith(session))
    expect(text).toContain('write docs')
    expect(text).toContain('[x] ~~ship release~~')
    expect(text).toContain('**1** pending')
    expect(text).toContain('**1** in progress')
    expect(text).toContain('**1** done')
  })

  it('clear-finished drops completed items and writes a new snapshot', async () => {
    const session = fakeSession([
      { content: 'keep me', status: 'pending' },
      { content: 'finish me', status: 'in_progress' },
      { content: 'done me', status: 'completed' },
    ])
    const text = await run('clear-finished', agentWith(session))
    expect(text).toContain('cleared 1 finished item')
    const remaining = session.lastTodos()
    expect(remaining?.map((t) => t.content)).toEqual(['keep me', 'finish me'])
    expect(remaining?.every((t) => t.status !== 'completed')).toBe(true)
  })

  it('delete removes an item by 1-based index', async () => {
    const session = fakeSession([
      { content: 'first', status: 'pending' },
      { content: 'second', status: 'pending' },
    ])
    const text = await run('delete 1', agentWith(session))
    expect(text).toContain('deleted todo 1')
    expect(session.lastTodos()?.map((t) => t.content)).toEqual(['second'])
  })

  it('delete rejects an out-of-range index', async () => {
    const session = fakeSession([{ content: 'only', status: 'pending' }])
    const text = await run('delete 5', agentWith(session))
    expect(text).toContain('out of range')
    expect(session.lastTodos()).toHaveLength(1)
  })

  it('resume copies the latest previous session list when empty', async () => {
    const session = fakeSession(null)
    const older = fakeSession([{ content: 'old task', status: 'pending' }], 'session-older')
    const text = await run('resume', agentWith(session, [older, session]))
    expect(text).toContain('resumed 1 todo')
    expect(session.lastTodos()?.map((t) => t.content)).toEqual(['old task'])
  })

  it('resume keeps the current list when one exists', async () => {
    const session = fakeSession([{ content: 'mine', status: 'pending' }])
    const older = fakeSession([{ content: 'theirs', status: 'pending' }], 'session-older')
    const text = await run('resume', agentWith(session, [older]))
    expect(text).toContain('already has a todo list')
    expect(session.lastTodos()?.map((t) => t.content)).toEqual(['mine'])
  })

  it('reports when no previous session has todos', async () => {
    const session = fakeSession(null)
    const text = await run('resume', agentWith(session, [fakeSession(null)]))
    expect(text).toContain('no previous session')
  })
})
