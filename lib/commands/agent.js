/**
 * `/agent` — manage custom agents. Phase 3 ships the listing + show subcommand
 * (read-only against the .kiro/agents/ directories), the create / edit /
 * delete writers land in phase 4.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
const AGENT_DIRS = [
    join(process.cwd(), '.kiro', 'agents'),
    join(homedir(), '.kiro', 'agents'),
];
function listAgents() {
    const out = [];
    for (const [source, dir] of [['project', AGENT_DIRS[0]], ['user', AGENT_DIRS[1]]]) {
        if (!existsSync(dir))
            continue;
        for (const entry of readdirSync(dir)) {
            if (!entry.endsWith('.json'))
                continue;
            const path = join(dir, entry);
            if (statSync(path).isDirectory())
                continue;
            try {
                const raw = JSON.parse(readFileSync(path, 'utf8'));
                out.push({
                    name: raw.name ?? basename(entry, '.json'),
                    source,
                    path,
                    description: typeof raw.description === 'string' ? raw.description : '',
                });
            }
            catch {
                out.push({ name: basename(entry, '.json'), source, path, description: '(invalid JSON)' });
            }
        }
    }
    return out;
}
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'list', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'list', args: tokens.slice(1) };
}
export const agentCommand = {
    name: 'agent',
    description: 'Manage custom agents: list, swap, create, edit, delete, show',
    input: { hint: '<list|swap|create|edit|delete|show|generate> [args]' },
    handler: async ({ rawInput }) => {
        const { name: sub, args } = parseSubcommand(rawInput);
        switch (sub) {
            case 'list':
            case '': {
                const agents = listAgents();
                if (agents.length === 0) {
                    return { kind: 'success', text: '(no custom agents yet — use /agent create <name> in phase 4)' };
                }
                const lines = [`${agents.length.toString()} custom agent(s):`];
                for (const a of agents) {
                    const tag = a.source === 'project' ? 'project' : 'user';
                    const desc = a.description !== '' ? `  ${a.description}` : '';
                    lines.push(`  [${tag}] ${a.name}${desc}`);
                }
                return { kind: 'success', text: lines.join('\n') };
            }
            case 'show': {
                const target = args[0];
                if (target === undefined)
                    return { kind: 'success', text: 'usage: /agent show <name>' };
                const match = listAgents().find((a) => a.name === target);
                if (match === undefined)
                    return { kind: 'success', text: `no agent named "${target}"` };
                try {
                    const raw = readFileSync(match.path, 'utf8');
                    return { kind: 'success', text: raw };
                }
                catch (error) {
                    return { kind: 'success', text: `error reading ${match.path}: ${error instanceof Error ? error.message : String(error)}` };
                }
            }
            case 'swap':
            case 'create':
            case 'edit':
            case 'delete':
            case 'generate':
            case 'migrate':
            case 'validate':
            case 'rename':
            case 'set-default':
                return { kind: 'success', text: `/agent ${sub} lands in phase 4.` };
            case 'schema':
                return {
                    kind: 'success',
                    text: [
                        'agent schema:',
                        '  {',
                        '    "name": "backend-specialist",',
                        '    "description": "Backend-only specialist",',
                        '    "model": "deepseek-official/deepseek-v4-flash",',
                        '    "systemPrompt": "...",',
                        '    "tools": { "allow": ["fs", "bash"], "deny": ["web"] },',
                        '    "mcpServers": [{ "name": "github", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }]',
                        '  }',
                    ].join('\n'),
                };
            case 'help':
                return { kind: 'success', text: '/agent <list|show|swap|create|edit|delete|generate|schema|help> [name]' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /agent help.` };
        }
    },
};
//# sourceMappingURL=agent.js.map