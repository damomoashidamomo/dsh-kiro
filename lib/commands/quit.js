/**
 * `/quit` — exit the TUI. Equivalent to Ctrl+D.
 */
export const quitCommand = {
    name: 'quit',
    description: 'Exit the TUI (equivalent to Ctrl+D)',
    handler: async () => {
        process.stdout.write('\x1b[?1049l');
        process.exit(0);
    },
};
//# sourceMappingURL=quit.js.map