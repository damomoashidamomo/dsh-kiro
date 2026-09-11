/**
 * `/context` — manage the persistent context files that the agent sees
 * alongside the user's prompt.
 *
 * Phase 3 ships the listing and helper commands. The `add` / `remove`
 * writers land in phase 4 once the file-reference provider is wired up.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'show', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'show', args: tokens.slice(1) };
}
function inspectPath(arg) {
    const abs = resolve(arg);
    if (!existsSync(abs))
        return `  ✗ ${arg}  (not found)`;
    const stat = statSync(abs);
    if (stat.isDirectory())
        return `  ▸ ${arg}  (directory, ${stat.size.toLocaleString()} bytes metadata)`;
    return `  ▸ ${arg}  (${stat.size.toLocaleString()} bytes)`;
}
export const contextCommand = {
    name: 'context',
    description: 'Add or remove files from the persistent session context',
    input: { hint: '<add|remove|show|clear> [path]' },
    handler: async ({ rawInput }) => {
        const { name: sub, args } = parseSubcommand(rawInput);
        switch (sub) {
            case 'add': {
                const target = args[0];
                if (target === undefined)
                    return { kind: 'success', text: 'usage: /context add <path>' };
                const line = inspectPath(target);
                return {
                    kind: 'success',
                    text: [
                        'queued for context (phase 4 wires the file-reference provider):',
                        line,
                    ].join('\n'),
                };
            }
            case 'remove':
            case 'rm':
                return { kind: 'success', text: 'context removal lands in phase 4.' };
            case 'show':
            case '':
                return {
                    kind: 'success',
                    text: 'session context is empty. Use /context add <path> to attach a file or directory.',
                };
            case 'clear':
                return { kind: 'success', text: '(context cleared — phase 4)' };
            case 'help':
                return { kind: 'success', text: '/context <add|remove|show|clear> [path]' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /context help.` };
        }
    },
};
//# sourceMappingURL=context.js.map