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
        description: 'Ask the user question(s) and WAIT for their answers (human-in-the-loop). IMPORTANT: when you need MULTIPLE pieces of information, put ALL questions into ONE call (the `questions` array) - the panel walks the user through them page by page. Use it when key information is missing, when several viable options need the user to decide, or before a risky/irreversible action. Do NOT use it for things you can decide yourself.',
        parameters: {
            type: 'object',
            properties: {
                question: { type: 'string', description: 'Single-question form: the question, phrased so it can be answered directly.' },
                questions: {
                    type: 'array',
                    description: 'Multi-question form (PREFERRED when several clarifications are needed): ALL questions in one call; the user answers them page by page.',
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string', description: 'The question' },
                            header: { type: 'string', description: 'Short panel title' },
                            detail: { type: 'string', description: 'Extra context shown under the question' },
                            options: {
                                type: 'array',
                                description: 'Answer options; omit for free-text-only',
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
                },
                header: { type: 'string', description: 'Single-question form: short panel title (optional).' },
                detail: { type: 'string', description: 'Single-question form: extra context (optional).' },
                options: {
                    type: 'array',
                    description: 'Single-question form: answer options (omit for free-text-only).',
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
        },
        output: {
            schema: { type: 'object', properties: { answered: { type: 'boolean' }, answer: { type: 'string' } }, required: ['answered'] },
            // render(args, value): value carries the REAL answers - the tool result
            // the model sees must include what the user actually chose.
            render(args, value) {
                const result = (value ?? {});
                const text = result.answer ?? result.error ?? (result.answered ? 'answered' : 'no answer');
                return [{ type: 'text', text: `用户回答：${text}` }];
            },
        },
        async execute(args) {
            const a = (args ?? {});
            const normOptions = (raw) => Array.isArray(raw)
                ? raw
                    .filter((o) => typeof o === 'object' && o !== null && typeof o.label === 'string')
                    .map((o) => ({ label: o.label, ...(typeof o.description === 'string' && o.description !== '' ? { description: o.description } : {}) }))
                : undefined;
            const questions = [];
            if (Array.isArray(a.questions)) {
                for (const item of a.questions) {
                    const q = (item ?? {});
                    if (typeof q.question === 'string' && q.question.trim() !== '') {
                        questions.push({
                            question: q.question,
                            ...(typeof q.header === 'string' && q.header.trim() !== '' ? { header: q.header } : {}),
                            ...(typeof q.detail === 'string' && q.detail.trim() !== '' ? { detail: q.detail } : {}),
                            ...(normOptions(q.options) !== undefined ? { options: normOptions(q.options) } : {}),
                        });
                    }
                }
            }
            if (questions.length === 0 && typeof a.question === 'string' && a.question.trim() !== '') {
                questions.push({
                    question: a.question,
                    ...(typeof a.header === 'string' && a.header.trim() !== '' ? { header: a.header } : {}),
                    ...(typeof a.detail === 'string' && a.detail.trim() !== '' ? { detail: a.detail } : {}),
                    ...(normOptions(a.options) !== undefined ? { options: normOptions(a.options) } : {}),
                });
            }
            if (questions.length === 0) {
                return { answered: false, error: 'question (or questions[]) is required' };
            }
            const userQuestions = ctx.get?.('userQuestions');
            if (userQuestions?.ask === undefined) {
                return { answered: false, error: 'question service unavailable (userQuestions)' };
            }
            const request = {
                questions: questions.map((q, i) => ({
                    id: `ask-user-${Date.now()}-${i}`,
                    ...(q.header !== undefined ? { header: q.header } : {}),
                    question: q.question,
                    ...(q.detail !== undefined ? { detail: q.detail } : {}),
                    ...(q.options !== undefined && q.options.length > 0 ? { options: q.options } : {}),
                })),
            };
            const answer = await userQuestions.ask(request);
            const parts = request.questions.map((q, i) => {
                const entry = answer.answers.find((a) => a.id === q.id) ?? answer.answers[i];
                const chosen = entry ? entry.selected.join(' / ') : '（未回答）';
                const custom = entry?.custom !== undefined && entry.custom !== '' ? `（补充：${entry.custom}）` : '';
                return `${q.question} → ${chosen}${custom}`;
            });
            return { answered: true, answer: parts.join('\n') };
        },
    };
    const disposers = [tools?.register(todoTool), tools?.register(thinkTool), tools?.register(askUser)];
    return () => {
        for (const dispose of disposers)
            dispose?.();
    };
}
//# sourceMappingURL=loop-tools.js.map