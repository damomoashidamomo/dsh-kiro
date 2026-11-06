/**
 * Custom-agent store — the `.kiro/agents/*.json` files kiro-cli reads.
 *
 * Project scope wins over user scope, the same precedence kiro-cli uses. The
 * write operations (create / rename / delete / validate) live here as pure
 * functions over a pair of directories so tests can run against a temp tree
 * instead of the user's `~/.kiro/agents`.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/agent-store
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
/** Project dir first, user dir second — lookup order matters. */
export function agentDirs(cwd = process.cwd(), home = homedir()) {
    return { project: join(cwd, '.kiro', 'agents'), user: join(home, '.kiro', 'agents') };
}
/** List every agent definition, project scope first. */
export function listAgents(dirs = agentDirs()) {
    const out = [];
    for (const [source, dir] of [['project', dirs.project], ['user', dirs.user]]) {
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
                    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : basename(entry, '.json'),
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
/** The file an agent name lives in, or undefined. Project scope wins. */
export function findAgent(dirs, name) {
    return listAgents(dirs).find((agent) => agent.name === name);
}
/** The kiro-shaped template a new agent starts from (kiro-cli field parity). */
export function agentTemplate(name, description, prompt) {
    return `${JSON.stringify({
        name,
        description,
        prompt,
        mcpServers: {},
        tools: ['*'],
        toolAliases: {},
        allowedTools: [],
        resources: [],
        hooks: {},
        toolsSettings: {},
        includeMcpJson: false,
        model: null,
    }, null, 2)}\n`;
}
/** Create `<user-dir>/<name>.json` from the template; refuses an existing file. */
export function createAgent(dirs, name, description = '', prompt = null) {
    const target = join(dirs.user, `${name}.json`); // kiro saves to the global dir
    if (existsSync(target))
        throw new Error(`已存在 ${target}`);
    mkdirSync(dirs.user, { recursive: true });
    writeFileSync(target, agentTemplate(name, description, prompt), 'utf8');
    return { path: target };
}
/** Rename: rewrite the file's `name` field and move it. */
export function renameAgent(dirs, from, to) {
    const match = findAgent(dirs, from);
    if (match === undefined)
        throw new Error(`no agent named "${from}"`);
    const next = join(match.path, '..', `${to}.json`);
    if (existsSync(next))
        throw new Error(`已存在 ${next}`);
    let preset = {};
    try {
        preset = JSON.parse(readFileSync(match.path, 'utf8'));
    }
    catch {
        // A broken file still renames; validate will report the damage.
    }
    preset['name'] = to;
    writeFileSync(next, `${JSON.stringify(preset, null, 2)}\n`, 'utf8');
    if (next !== match.path)
        rmSync(match.path);
    return { path: next };
}
/** Delete an agent definition file. */
export function deleteAgent(dirs, name) {
    const match = findAgent(dirs, name);
    if (match === undefined)
        throw new Error(`no agent named "${name}"`);
    rmSync(match.path);
    return { path: match.path };
}
/** A definition is valid when it parses and carries a non-empty name. */
export function validateAgentFile(path) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (error) {
        return { ok: false, reason: `不是合法 JSON：${error instanceof Error ? error.message : String(error)}` };
    }
    if (typeof parsed.name !== 'string' || parsed.name === '') {
        return { ok: false, reason: '缺少 name 字段' };
    }
    return { ok: true, name: parsed.name };
}
//# sourceMappingURL=agent-store.js.map