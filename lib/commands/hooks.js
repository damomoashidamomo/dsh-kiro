export const hooksCommand = {
    name: 'hooks',
    description: 'Show the status of context hooks',
    handler: async () => {
        return {
            kind: 'success',
            text: [
                'hook providers:',
                '  @deepseek-ai/dsh-hooks-claude-code  registered',
                '  @deepseek-ai/dsh-hooks-codex         registered',
            ].join('\n'),
        };
    },
};
//# sourceMappingURL=hooks.js.map