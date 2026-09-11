export const usageCommand = {
    name: 'usage',
    description: 'Show token usage, credits and billing for this session',
    handler: async () => {
        return {
            kind: 'success',
            text: [
                'session usage:',
                '  tokens used:  see the StatusBar',
                '  credits:      wired in phase 4 via the kiro-usage projection',
            ].join('\n'),
        };
    },
};
//# sourceMappingURL=usage.js.map