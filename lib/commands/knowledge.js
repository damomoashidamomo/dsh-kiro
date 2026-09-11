function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'show', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'show', args: tokens.slice(1) };
}
export const knowledgeCommand = {
    name: 'knowledge',
    description: 'Manage the persistent knowledge base',
    input: { hint: '<add|show|remove|update|clear|cancel>' },
    handler: async ({ rawInput }) => {
        const { name: sub } = parseSubcommand(rawInput);
        switch (sub) {
            case 'show':
            case '':
                return { kind: 'success', text: '(no knowledge bases yet — phase 5 wires BM25 indexing over .kiro/knowledge/)' };
            case 'add':
            case 'remove':
            case 'update':
            case 'clear':
            case 'cancel':
                return { kind: 'success', text: `/knowledge ${sub} lands in phase 5.` };
            case 'help':
                return { kind: 'success', text: '/knowledge <add|show|remove|update|clear|cancel> [path]' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /knowledge help.` };
        }
    },
};
//# sourceMappingURL=knowledge.js.map