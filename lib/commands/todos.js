/** TODO list summary. */
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'view', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'view', args: tokens.slice(1) };
}
export const todoCommand = {
    name: 'todos',
    description: 'Manage TODO lists — view, resume, clear-finished, delete',
    input: { hint: '<view|resume|clear-finished|delete> [args]' },
    handler: async ({ rawInput }) => {
        const { name: sub, args } = parseSubcommand(rawInput);
        switch (sub) {
            case 'view':
            case '':
                return { kind: 'success', text: '(no TODO lists yet — phase 4 wires `dsh-tool-todo`)' };
            case 'resume':
            case 'clear-finished':
            case 'delete':
                return { kind: 'success', text: `/todos ${sub} lands in phase 4.` };
            case 'help':
                return { kind: 'success', text: '/todos <view|resume|clear-finished|delete> [list-id]' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /todos help.` };
        }
    },
};
//# sourceMappingURL=todos.js.map