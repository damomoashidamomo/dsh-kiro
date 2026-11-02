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
    handler: async ({ agent, rawInput }) => {
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
            case 'swap': {
                // Honest subset: apply the preset's declared provider/model/effort
                // to the CURRENT session via the live model-switch machinery. A
                // persona-level switch (separate system prompt / toolset per agent)
                // has no first-class platform switch yet — the preset's `prompt`
                // field is reported instead of silently ignored.
                const target = args[0];
                if (target === undefined)
                    return { kind: 'success', text: 'usage: /agent swap <name>' };
                const match = listAgents().find((a) => a.name === target);
                if (match === undefined)
                    return { kind: 'error', text: `no agent named "${target}"` };
                let preset = {};
                try {
                    preset = JSON.parse(readFileSync(match.path, 'utf8'));
                }
                catch {
                    return { kind: 'error', text: `${match.path} 不是有效 JSON` };
                }
                const ctx = agent.ctx;
                const get = ctx?.get;
                const switcher = get?.call(ctx, 'kiroModelSwitch');
                const effort = get?.call(ctx, 'kiroEffortControl');
                const applied = [];
                const full = preset.model !== undefined
                    ? `${preset.provider ?? (preset.model.includes('/') ? preset.model.split('/')[0] : undefined)}/${preset.model.includes('/') ? preset.model.split('/')[1] : preset.model}`
                    : undefined;
                if (full !== undefined && switcher?.apply !== undefined) {
                    const [provider, model] = full.split('/');
                    switcher.apply({ provider, model });
                    applied.push(`模型 → ${full}`);
                }
                if (preset.effort !== undefined && effort?.setManual !== undefined) {
                    effort.setManual(preset.effort);
                    applied.push(`档位 → ${preset.effort}`);
                }
                const lines = [`已切换到 agent「${target}」（${match.source} 级）：`];
                lines.push(applied.length > 0 ? `  ${applied.join(' · ')}` : '  未声明模型/档位，保持现状。');
                if (preset.prompt !== undefined) {
                    lines.push(`  该预设带人格提示（${preset.prompt.length} 字）——平台暂无按 agent 隔离系统提示的开关，`);
                    lines.push('  如需生效可放入 .kiro/steering/<name>.md 后 /steering reload。');
                }
                return { kind: 'success', text: lines.join('\n') };
            }
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