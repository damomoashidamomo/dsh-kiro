/**
 * `/help` — list all slash commands and a short summary, grouped by surface.
 */
import { groupCommands } from './registry.js';
export const helpCommand = {
    name: 'help',
    description: 'Show available slash commands and their descriptions',
    input: { hint: '[command-name]' },
    handler: async ({ rawInput }) => {
        const query = rawInput.trim().toLowerCase();
        const groups = groupCommands();
        if (query !== '') {
            for (const group of groups) {
                const match = group.items.find(item => item.name === query);
                if (match !== undefined) {
                    const hint = match.input?.hint !== undefined ? ` ${match.input.hint}` : '';
                    return {
                        kind: 'success',
                        text: [
                            `/${match.name}${hint}`,
                            `  ${match.description}`,
                        ].join('\n'),
                    };
                }
            }
            return { kind: "success", text: `No command named "${query}". Try /help for the full list.` };
        }
        const lines = [];
        lines.push('Available commands:');
        for (const group of groups) {
            lines.push('');
            lines.push(` ${group.title}:`);
            for (const cmd of group.items) {
                const hint = cmd.input?.hint !== undefined ? ` ${cmd.input.hint}` : '';
                lines.push(`  /${cmd.name.padEnd(14)}${hint}  ${cmd.description}`);
            }
        }
        return { kind: "success", text: lines.join('\n') };
    },
};
//# sourceMappingURL=help.js.map