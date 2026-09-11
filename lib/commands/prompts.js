function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'list', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'list', args: tokens.slice(1) };
}
export const promptsCommand = {
    name: 'prompts',
    description: 'Manage saved prompts — list, get, create, edit, remove',
    input: { hint: '<list|get|create|edit|remove>' },
    handler: async ({ rawInput }) => {
        const { name: sub } = parseSubcommand(rawInput);
        switch (sub) {
            case 'list':
            case '':
                return { kind: 'success', text: '(no saved prompts — phase 4 wires the prompt store)' };
            case 'get':
            case 'create':
            case 'edit':
            case 'remove':
            case 'details':
                return { kind: 'success', text: `/prompts ${sub} lands in phase 4.` };
            case 'help':
                return { kind: 'success', text: '/prompts <list|get|create|edit|remove|details> [name]' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /prompts help.` };
        }
    },
};
//# sourceMappingURL=prompts.js.map