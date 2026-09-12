/**
 * `/todos` — the agent's todo list.
 *
 * Todos are whole-list snapshots written by the model through the
 * `todo_write` tool (dsh-tool-todo) and surfaced here as a session
 * projection: each write replaces the list, last write wins. This command
 * is the human side of that list.
 *
 * Subcommands:
 *   view                 show the current list (default)
 *   resume               bring the latest previous session's todo list into
 *                        this session (when this session has none yet);
 *                        covers live sessions in this process — e.g. after
 *                        `/chat new`
 *   clear-finished       drop completed items and write the trimmed list
 *   delete <index>       remove one item by its 1-based list index
 *   help                 usage
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { Session } from '@deepseek-ai/dsh-session'

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** Latest `todo/write` payload for a session, or `null` before the first write. */
function currentTodos(session: Session): TodoItem[] | null {
  // `todo/write` is not part of the core SessionEvent union in our type
  // view (the augmentation ships in dsh-tool-todo), so walk the log loosely.
  const events = session.ownEvents() as ReadonlyArray<{ type: string; data: unknown }>
  let last: { data: { todos?: unknown } } | undefined
  for (const event of events) {
    if (event.type === 'todo/write') last = event as { data: { todos?: unknown } }
  }
  if (last === undefined) return null
  const todos = last.data.todos
  return Array.isArray(todos) ? (todos as TodoItem[]) : null
}

/** Append a whole-list todo snapshot to the session log. */
function writeTodos(session: Session, todos: TodoItem[]): void {
  // Known runtime event type; cast past the core-union typing.
  const append = session.append as unknown as (type: string, data: { todos: TodoItem[] }) => void
  append.call(session, 'todo/write', { todos })
}

/** Render the todo list as markdown-ish text for the transcript. */
function renderList(todos: readonly TodoItem[]): string {
  if (todos.length === 0) return '(the todo list is empty)'
  const lines = todos.map((todo, index) => {
    const mark = todo.status === 'completed' ? '[x]' : todo.status === 'in_progress' ? '[~]' : '[ ]'
    const content = todo.status === 'completed' ? `~~${todo.content}~~` : todo.content
    return `${index + 1}. ${mark} ${content}`
  })
  const pending = todos.filter((t) => t.status === 'pending').length
  const inProgress = todos.filter((t) => t.status === 'in_progress').length
  const completed = todos.filter((t) => t.status === 'completed').length
  lines.push('', `**${pending}** pending · **${inProgress}** in progress · **${completed}** done`)
  return lines.join('\n')
}

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'view', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'view', args: tokens.slice(1) }
}

/** Resolve `sessions` (for resume) from the agent's context. */
function resolveSessions(agentCtx: unknown): { list(): readonly Session[] } | undefined {
  if (agentCtx === null || typeof agentCtx !== 'object') return undefined
  const get = (agentCtx as { get?: (name: string) => unknown }).get
  if (typeof get !== 'function') return undefined
  const sessions = get.call(agentCtx, 'sessions')
  return sessions as { list(): readonly Session[] } | undefined
}

export const todoCommand: CommandDefinition = {
  name: 'todos',
  description: 'Agent todo list — view, resume, clear-finished, delete',
  input: { hint: '<view|resume|clear-finished|delete> [index]' },
  handler: async ({ agent, rawInput }) => {
    const { name: sub, args } = parseSubcommand(rawInput)
    const session = (agent as unknown as { session?: Session }).session
    if (session === undefined) {
      return { kind: 'error', text: 'todos: the agent session is not available' }
    }

    switch (sub) {
      case 'view':
      case '': {
        const todos = currentTodos(session)
        return {
          kind: 'success',
          text: todos === null
            ? '(no todos yet — ask the agent to plan work, or /todos resume to bring a previous session\u2019s list)'
            : renderList(todos),
        }
      }
      case 'resume': {
        const current = currentTodos(session)
        if (current !== null && current.length > 0) {
          return { kind: 'success', text: `this session already has a todo list:\n${renderList(current)}` }
        }
        const sessionsSvc = resolveSessions((agent as unknown as { ctx?: unknown }).ctx)
        if (sessionsSvc === undefined) {
          return { kind: 'error', text: 'todos: the sessions service is not available' }
        }
        const others = sessionsSvc.list().filter((candidate) => candidate.id !== session.id)
        for (let i = others.length - 1; i >= 0; i -= 1) {
          const candidate = others[i]!
          const list = currentTodos(candidate)
          if (list !== null && list.length > 0) {
            writeTodos(session, list)
            return {
              kind: 'success',
              text: `resumed ${list.length} todo${list.length === 1 ? '' : 's'} from session ${candidate.id}:\n${renderList(list)}`,
            }
          }
        }
        return { kind: 'success', text: '(no previous session has a todo list to resume)' }
      }
      case 'clear-finished': {
        const todos = currentTodos(session)
        if (todos === null || todos.length === 0) {
          return { kind: 'success', text: '(the todo list is empty — nothing to clear)' }
        }
        const remaining = todos.filter((todo) => todo.status !== 'completed')
        const removed = todos.length - remaining.length
        writeTodos(session, remaining)
        return {
          kind: 'success',
          text: removed === 0
            ? '(no completed items to clear)'
            : `cleared ${removed} finished item${removed === 1 ? '' : 's'}\n${renderList(remaining)}`,
        }
      }
      case 'delete': {
        const rawIndex = args[0]
        if (rawIndex === undefined || !/^\d+$/u.test(rawIndex)) {
          return { kind: 'success', text: 'usage: /todos delete <index> (1-based list position)' }
        }
        const index = Number.parseInt(rawIndex, 10)
        const todos = currentTodos(session)
        if (todos === null || todos.length === 0) {
          return { kind: 'success', text: '(the todo list is empty)' }
        }
        if (index < 1 || index > todos.length) {
          return {
            kind: 'error',
            text: `todos: index ${index} is out of range (list has ${todos.length} item${todos.length === 1 ? '' : 's'})`,
          }
        }
        const removed = todos[index - 1]!.content
        const remaining = todos.filter((_, i) => i !== index - 1)
        writeTodos(session, remaining)
        return {
          kind: 'success',
          text: `deleted todo ${index} (“${removed}”)\n${renderList(remaining)}`,
        }
      }
      case 'help':
        return {
          kind: 'success',
          text: [
            '/todos view',
            '/todos resume',
            '/todos clear-finished',
            '/todos delete <index>',
            '',
            'The list is written by the agent through the todo_write tool;',
            'this command only reads it and applies the maintenance edits above.',
          ].join('\n'),
        }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /todos help.` }
    }
  },
}
