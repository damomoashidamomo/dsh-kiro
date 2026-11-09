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
const TODO_STATUSES = ['pending', 'in_progress', 'completed'];
/** Parse and validate the todo rows the model sent. */
function parseTodos(args) {
    const rows = args?.todos;
    if (!Array.isArray(rows))
        return undefined;
    const out = [];
    for (const row of rows) {
        if (row === null || typeof row !== 'object')
            continue;
        const content = row.content;
        const status = row.status;
        if (typeof content !== 'string' || content.trim() === '')
            continue;
        out.push({ content: content.slice(0, 200), status: TODO_STATUSES.includes(String(status)) ? String(status) : 'pending' });
    }
    return out.length > 0 ? out : undefined;
}
/** Register both tools; returns the dispose pair. */
export function registerLoopTools(ctx, deps) {
    const tools = ctx.tools;
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
            render: () => [{ type: 'text', text: 'todo list updated' }],
        },
        async execute(args) {
            const todos = parseTodos(args);
            if (todos === undefined)
                return { updated: false };
            deps.controller.ingestEvent({ type: 'todo/write', seq: 0, data: { todos } });
            return { updated: true, count: todos.length };
        },
    };
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
            render: () => [{ type: 'text', text: 'thought recorded' }],
        },
        async execute(args) {
            const thought = args?.thought;
            if (typeof thought !== 'string' || thought.trim() === '')
                return { recorded: false };
            const preview = thought.replace(/\s+/gu, ' ').trim().slice(0, 80);
            deps.controller.ingestEvent({
                type: 'system/message',
                seq: 0,
                data: { text: `◇ 思考草稿：${preview}${thought.length > 80 ? '…' : ''}` },
            });
            return { recorded: true };
        },
    };
    // ask_user (HITL a)：模型主动向用户提问/澄清。工具执行挂在平台的
    // user-questions 瀑布上（问题面板由 SessionController 驱动），两种引擎
    // 通用——kiro loop 的 executeTool 对非引擎工具回落到 tools.execute ✓。
    const askUser = {
        name: 'ask_user',
        description: 'Ask the user a question and WAIT for their answer (human-in-the-loop). Use it when key information is missing, when several viable options need the user to decide, or before a risky/irreversible action. Do NOT use it for things you can decide yourself. The user sees the question as an interactive panel and answers by picking an option or typing free text.',
        parameters: {
            type: 'object',
            properties: {
                question: { type: 'string', description: 'The question, phrased so it can be answered directly.' },
                header: { type: 'string', description: 'Short panel title (optional).' },
                detail: { type: 'string', description: 'Extra context shown under the question (optional).' },
                options: {
                    type: 'array',
                    description: 'Answer options (optional). Each is one selectable row; omit for free-text-only.',
                    items: {
                        type: 'object',
                        properties: {
                            label: { type: 'string', description: 'The answer text' },
                            description: { type: 'string', description: 'One-line explanation' },
                        },
                        required: ['label'],
                    },
                },
            },
            required: ['question'],
        },
        output: {
            schema: { type: 'object', properties: { answered: { type: 'boolean' } }, required: ['answered'] },
            render: () => [{ type: 'text', text: 'the user answered' }],
        },
        async execute(args) {
            const { question, header, detail, options } = (args ?? {});
            if (typeof question !== 'string' || question.trim() === '') {
                return { answered: false, error: 'question is required' };
            }
            const userQuestions = ctx.get?.('userQuestions');
            if (userQuestions?.ask === undefined) {
                return { answered: false, error: 'question service unavailable (userQuestions)' };
            }
            const safeOptions = Array.isArray(options)
                ? options
                    .filter((o) => typeof o === 'object' && o !== null && typeof o.label === 'string')
                    .map((o) => ({ label: o.label, ...(typeof o.description === 'string' ? { description: o.description } : {}) }))
                : [];
            const request = {
                questions: [{
                        id: `ask-user-${Date.now()}`,
                        ...(typeof header === 'string' && header.trim() !== '' ? { header } : {}),
                        question,
                        ...(typeof detail === 'string' && detail.trim() !== '' ? { detail } : {}),
                        ...(safeOptions.length > 0 ? { options: safeOptions } : {}),
                    }],
            };
            const answer = await userQuestions.ask(request);
            const parts = answer.answers.map((entry) => {
                const chosen = entry.selected.join(' / ');
                return chosen + (entry.custom !== undefined && entry.custom !== '' ? `（补充：${entry.custom}）` : '');
            });
            return { answered: true, answer: parts.join('；'), };
        },
    };
    const disposers = [tools?.register(todoTool), tools?.register(thinkTool), tools?.register(askUser)];
    return () => {
        for (const dispose of disposers)
            dispose?.();
    };
}
//# sourceMappingURL=loop-tools.js.map