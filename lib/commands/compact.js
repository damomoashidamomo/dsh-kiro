export const compactCommand = {
    name: 'compact',
    description: 'Summarize the conversation and free up context window space',
    handler: async () => {
        return {
            kind: 'success',
            text: 'compact lands in phase 4 — calls into dsh-compaction-basic to fold the durable log into a summary.',
        };
    },
};
//# sourceMappingURL=compact.js.map