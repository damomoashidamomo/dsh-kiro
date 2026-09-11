/**
 * dsh-kiro custom-agents loader. Reads `.kiro/agents/*.json` and
 * `~/.kiro/agents/*.json`, validates each against the kiro agent schema, and
 * exposes them through a registry the runtime can consult.
 *
 * @module @damomoashidamomo/dsh-kiro/agents/loader
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
const VALID_NAME = /^[a-z][a-z0-9_-]*$/u;
function parseToolPolicy(value) {
    if (typeof value !== 'object' || value === null)
        return {};
    const policy = value;
    const allow = Array.isArray(policy.allow)
        ? policy.allow.filter((entry) => typeof entry === 'string')
        : undefined;
    const deny = Array.isArray(policy.deny)
        ? policy.deny.filter((entry) => typeof entry === 'string')
        : undefined;
    return {
        ...allow !== undefined ? { allow } : {},
        ...deny !== undefined ? { deny } : {},
    };
}
function parseMcpServers(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null)
            return [];
        const item = entry;
        const name = item['name'];
        if (typeof name !== 'string')
            return [];
        const command = typeof item['command'] === 'string' ? item['command'] : undefined;
        const url = typeof item['url'] === 'string' ? item['url'] : undefined;
        const args = Array.isArray(item['args'])
            ? item['args'].filter((arg) => typeof arg === 'string')
            : undefined;
        const envRaw = item['env'];
        const env = typeof envRaw === 'object' && envRaw !== null
            ? Object.fromEntries(Object.entries(envRaw).filter((entry) => typeof entry[1] === 'string'))
            : undefined;
        return [{
                name,
                ...command !== undefined ? { command } : {},
                ...url !== undefined ? { url } : {},
                ...args !== undefined ? { args } : {},
                ...env !== undefined ? { env } : {},
            }];
    });
}
/** Parse and validate one agent config object. Throws on invalid input. */
export function parseAgentConfig(raw, source, path) {
    if (typeof raw !== 'object' || raw === null) {
        throw new TypeError(`agent config at ${path} is not an object`);
    }
    const data = raw;
    const name = typeof data['name'] === 'string' ? data['name'] : basename(path, '.json');
    if (!VALID_NAME.test(name)) {
        throw new Error(`agent config at ${path}: invalid name "${name}" (must match ${String(VALID_NAME)})`);
    }
    const description = typeof data['description'] === 'string' ? data['description'] : '';
    const model = typeof data['model'] === 'string' ? data['model'] : undefined;
    const systemPrompt = typeof data['systemPrompt'] === 'string' ? data['systemPrompt'] : undefined;
    const tools = parseToolPolicy(data['tools']);
    const steeringRaw = data['steeringFiles'];
    const steeringFiles = Array.isArray(steeringRaw)
        ? steeringRaw.filter((entry) => typeof entry === 'string')
        : [];
    const mcpServers = parseMcpServers(data['mcpServers']);
    const allowSubagents = data['allowSubagents'] !== false;
    const effortRaw = data['effort'];
    const effort = (effortRaw === 'low' || effortRaw === 'medium' || effortRaw === 'high' || effortRaw === 'xhigh' || effortRaw === 'max')
        ? effortRaw
        : undefined;
    const modeRaw = data['mode'];
    const mode = modeRaw === 'vibe' || modeRaw === 'spec' ? modeRaw : undefined;
    return {
        name,
        description,
        source,
        path,
        ...model !== undefined ? { model } : {},
        ...systemPrompt !== undefined ? { systemPrompt } : {},
        tools,
        steeringFiles,
        mcpServers,
        allowSubagents,
        ...effort !== undefined ? { effort } : {},
        ...mode !== undefined ? { mode } : {},
        raw: data,
    };
}
/** Walk the well-known agent directories and parse every JSON file. */
export function loadAgentConfigs() {
    const sources = [
        ['project', join(process.cwd(), '.kiro', 'agents')],
        ['user', join(homedir(), '.kiro', 'agents')],
    ];
    const out = [];
    for (const [source, dir] of sources) {
        if (!existsSync(dir))
            continue;
        const entries = readdirSync(dir);
        for (const entry of entries) {
            if (!entry.endsWith('.json'))
                continue;
            const path = join(dir, entry);
            if (!statSync(path).isFile())
                continue;
            let raw;
            try {
                raw = JSON.parse(readFileSync(path, 'utf8'));
            }
            catch (error) {
                continue;
            }
            try {
                out.push(parseAgentConfig(raw, source, path));
            }
            catch {
                continue;
            }
        }
    }
    return out;
}
//# sourceMappingURL=loader.js.map