/**
 * Custom-agent store — the `.dsh-kiro/agents/*.json` files kiro-cli reads.
 *
 * Project scope wins over user scope, the same precedence kiro-cli uses. The
 * write operations (create / rename / delete / validate) live here as pure
 * functions over a pair of directories so tests can run against a temp tree
 * instead of the user's `~/.dsh-kiro/agents`.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/agent-store
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { dshKiroUserRoot } from "./kiro-home.js";
/** Project dir first, user dir second — lookup order matters. */
export function agentDirs(cwd = process.cwd(), home = homedir()) {
    return { project: join(cwd, '.dsh-kiro', 'agents'), user: join(dshKiroUserRoot(home), 'agents') };
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
function userEnginesFile() {
    return join(dshKiroUserRoot(), 'agent-engines.json');
}
/**
 * 绑定文件的候选列表（按优先级）：
 * 1. 用户级 `~/.dsh-kiro/agent-engines.json` —— 写入的唯一落点，一处写处处生效；
 * 2. 从 cwd 逐级向上的 `.dsh-kiro/agent-engines.json`（历史/工作区级文件，兼容读取）。
 * 注意：`agent-engines.json` 是 dsh-kiro 私有文件名，kiro-cli 不读取。
 */
function enginesFileCandidates(cwd) {
    const userFile = userEnginesFile();
    const list = [userFile];
    let dir = cwd;
    for (;;) {
        const candidate = join(dir, '.dsh-kiro', 'agent-engines.json');
        if (candidate !== userFile)
            list.push(candidate);
        if (dir === homedir() || dir === '/' || dir.length <= 3)
            break;
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return list;
}
function readEnginesDoc(path) {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    }
    catch {
        return {};
    }
}
function writeEnginesFile(doc) {
    mkdirSync(dirname(userEnginesFile()), { recursive: true });
    writeFileSync(userEnginesFile(), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}
/** 某 agent 的引擎绑定：用户级优先，其次从 cwd 向上找到的最近一份。 */
export function getEngineBinding(cwd, name) {
    for (const path of enginesFileCandidates(cwd)) {
        const binding = readEnginesDoc(path).bindings?.[name];
        if (binding === undefined || typeof binding !== 'object')
            continue;
        const engine = binding.engine === 'kiro' || binding.engine === 'dsh' ? binding.engine : undefined;
        if (engine === undefined)
            continue;
        const toolEngine = binding.toolEngine === 'rust' ? 'rust' : binding.toolEngine === 'dsh' ? 'dsh' : undefined;
        return { engine, toolEngine };
    }
    return undefined;
}
/** 写入/更新引擎绑定（固定写用户级文件）。 */
export function setEngineBinding(_cwd, name, binding) {
    const doc = readEnginesDoc(userEnginesFile());
    doc.bindings = { ...(doc.bindings ?? {}), [name]: { engine: binding.engine, ...(binding.toolEngine !== undefined ? { toolEngine: binding.toolEngine } : {}) } };
    writeEnginesFile(doc);
}
/** 清除某 agent 的引擎绑定（用户级与沿途工作区文件都清）。 */
export function clearEngineBinding(cwd, name) {
    let cleared = false;
    for (const path of enginesFileCandidates(cwd)) {
        const doc = readEnginesDoc(path);
        if (doc.bindings?.[name] !== undefined) {
            delete doc.bindings[name];
            if (path === userEnginesFile())
                writeEnginesFile(doc);
            else
                writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
            cleared = true;
        }
    }
    return cleared;
}
/** 启动默认 agent（用户级优先，其次向上遍历），未设置返回 undefined。 */
export function getDefaultAgent(cwd) {
    for (const path of enginesFileCandidates(cwd)) {
        const agent = readEnginesDoc(path).defaults?.agent;
        if (typeof agent === 'string' && agent.trim() !== '')
            return agent;
    }
    return undefined;
}
/** 设置启动默认 agent（固定写用户级文件）。 */
export function setDefaultAgent(_cwd, name) {
    const doc = readEnginesDoc(userEnginesFile());
    doc.defaults = { ...(doc.defaults ?? {}), agent: name };
    writeEnginesFile(doc);
}
//# sourceMappingURL=agent-store.js.map