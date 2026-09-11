/**
 * `/clear` — clear the transcript (does NOT delete the session; the log
 * persists in the JSONL store and a /chat resume would replay it).
 */
export const clearCommand = {
    name: 'clear',
    description: 'Clear the visible transcript (the session log is preserved)',
    handler: async () => {
        return { kind: "success", text: '(cleared)' };
    },
};
//# sourceMappingURL=clear.js.map