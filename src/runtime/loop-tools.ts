/**
 * kiro-loop owned tools (P3): `kiro_todo_write` and `kiro_think`, registered
 * on the platform tool registry so BOTH loops can use them, wired straight
 * into the TUI controller:
 *
 * - kiro_todo_write: replaces the transcript's checklist snapshot (same
 *   dedupe the platform todo projection applies) — the model gains the
 *   kiro-cli todo_list tool surface on the own-loop path.
 * - kiro_think: a scratchpad tool (kiro-cli's thinking tool): the model
 *   writes its atomic-step breakdown; the text rides the history for the
 *   model only and the transcript shows a one-line summary card.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/loop-tools
 */

import type { Context } from '@deepseek-ai/cordis'

/** Structural slice of the platform tool registry we register through. */
interface ToolsRegistry {
  register(definition: unknown): () => void
}

export interface LoopToolDeps {
  readonly controller: {
    ingestEvent(event: unknown): void
  }
}

const TODO_STATUSES = ['pending', 'in_progress', 'completed']

/** Parse and validate the todo rows the model sent. */
function parseTodos(args: unknown): Array<{ content: string; status: string }> | undefined {
  const rows = (args as { todos?: unknown } | null)?.todos
  if (!Array.isArray(rows)) return undefined
  const out: Array<{ content: string; status: string }> = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const content = (row as { content?: unknown }).content
    const status = (row as { status?: unknown }).status
    if (typeof content !== 'string' || content.trim() === '') continue
    out.push({ content: content.slice(0, 200), status: TODO_STATUSES.includes(String(status)) ? String(status) : 'pending' })
  }
  return out.length > 0 ? out : undefined
}

/** Register both tools; returns the dispose pair. */
export function registerLoopTools(ctx: Context, deps: LoopToolDeps): () => void {
  const tools = (ctx as unknown as { tools?: ToolsRegistry }).tools

  const todoTool = {
    name: 'kiro_todo_write',
    description: 'Write the task checklist for the current work. Call it whenever the plan changes: each row is one task with status pending | in_progress | completed. The user sees this list live in the transcript.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The full checklist; replaces the previous snapshot.',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'One short task sentence' },
              status: { type: 'string', enum: TODO_STATUSES },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
    output: {
      schema: { type: 'object', properties: { updated: { type: 'boolean' } }, required: ['updated'] },
      render: (): Array<{ type: 'text'; text: string }> => [{ type: 'text', text: 'todo list updated' }],
    },
    async execute(args: unknown): Promise<unknown> {
      const todos = parseTodos(args)
      if (todos === undefined) return { updated: false }
      deps.controller.ingestEvent({ type: 'todo/write', seq: 0, data: { todos } })
      return { updated: true, count: todos.length }
    },
  }

  const thinkTool = {
    name: 'kiro_think',
    description: 'A private scratchpad for complex work: write the atomic-step breakdown, assumptions, and next actions BEFORE acting. The text stays in the conversation for you; the user only sees that you are thinking. Use it to structure hard tasks instead of acting blindly.',
    parameters: {
      type: 'object',
      properties: {
        thought: { type: 'string', description: 'Your structured reasoning: steps, assumptions, next action.' },
      },
      required: ['thought'],
    },
    output: {
      schema: { type: 'object', properties: { recorded: { type: 'boolean' } }, required: ['recorded'] },
      render: (): Array<{ type: 'text'; text: string }> => [{ type: 'text', text: 'thought recorded' }],
    },
    async execute(args: unknown): Promise<unknown> {
      const thought = (args as { thought?: unknown } | null)?.thought
      if (typeof thought !== 'string' || thought.trim() === '') return { recorded: false }
      const preview = thought.replace(/\s+/gu, ' ').trim().slice(0, 80)
      deps.controller.ingestEvent({
        type: 'system/message',
        seq: 0,
        data: { text: `◇ 思考草稿：${preview}${thought.length > 80 ? '…' : ''}` },
      })
      return { recorded: true }
    },
  }

  const disposers = [tools?.register(todoTool), tools?.register(thinkTool)]
  return () => {
    for (const dispose of disposers) dispose?.()
  }
}
