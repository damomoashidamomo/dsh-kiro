/**
 * `/agent` — manage custom agents against `.dsh-kiro/agents/` directories
 * (project first, then the user-global one — the same files kiro-cli reads).
 *
 * create / edit / delete / rename / set-default / validate are implemented
 * here (kiro-cli parity): create writes the kiro-shaped template (name,
 * description, prompt, tools ["*"], allowedTools, model, …) and — unless
 * `--prompt` is given — opens $EDITOR on it, the way kiro-cli opens vim.
 * generate (model-authored definitions) and migrate stay phase-4 stubs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentDirs, clearEngineBinding, createAgent, deleteAgent, findAgent, getEngineBinding, listAgents, renameAgent, setDefaultAgent, setEngineBinding, validateAgentFile } from "../utils/agent-store.js";
import { tokenizeArgs } from "../utils/args.js";
import { applyAgentPreset } from "../utils/agent-apply.js";
/** The directories this workspace reads agent definitions from. */
function dirs() {
    return agentDirs();
}
/** The user-global agent dir (where create/generate land, like kiro-cli). */
function AGENT_DIRS_FALLBACK() {
    return agentDirs().user;
}
/** Generic agent-scope service lookup (cordis receiver rules apply). */
function serviceOf(agentCtx, name) {
    const ctx = agentCtx.ctx;
    if (ctx === undefined || ctx === null)
        return undefined;
    const get = ctx.get;
    return typeof get === 'function' ? get.call(ctx, name) : undefined;
}
/** Pick $EDITOR like /editor does. */
function pickEditor() {
    return process.env['EDITOR'] ?? process.env['VISUAL'] ?? (process.platform === 'win32' ? 'notepad' : 'vi');
}
/** Flag lookup: --name x / --name=x / positional. */
function flagValue(args, flag) {
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === `--${flag}`)
            return args[i + 1];
        if (arg.startsWith(`--${flag}=`))
            return arg.slice(flag.length + 3);
    }
    return undefined;
}
/** 中文子命令别名 — 输入法下打中文比记英文拼写自然。 */
const ALIASES = {
    生成: 'generate',
    列表: 'list',
    切换: 'swap',
    新建: 'create',
    创建: 'create',
    编辑: 'edit',
    删除: 'delete',
    重命名: 'rename',
    校验: 'validate',
    查看: 'show',
    帮助: 'help',
};
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'list', args: [] };
    // Quote-aware: --prompt "多词 文本" must arrive as ONE token without quotes.
    const tokens = tokenizeArgs(trimmed);
    const name = ALIASES[tokens[0] ?? ''] ?? tokens[0] ?? 'list';
    return { name, args: tokens.slice(1) };
}
/** Bridge for the /agent option menu (shadow-proxy-free list access). */
export function agentListBridge() {
    return listAgents().map((a) => ({ name: a.name, description: a.description }));
}
/** Render `/agent list` output; the active preset gets a ◀ 当前 marker. */
export function renderAgentList(agents, current) {
    const lines = [`${agents.length.toString()} custom agent(s)（当前：${current}）:`];
    for (const a of agents) {
        const tag = a.source === 'project' ? 'project' : 'user';
        const mark = a.name === current ? ' ◀ 当前' : '';
        const desc = a.description !== '' ? `  ${a.description}` : '';
        lines.push(`  [${tag}] ${a.name}${mark}${desc}`);
    }
    return lines.join('\n');
}
export const agentCommand = {
    name: 'agent',
    description: 'Manage custom agents: list, swap, create, edit, delete, show',
    input: { hint: '<list|swap|create|edit|delete|show|set-engine|generate> [args]' },
    handler: async ({ agent, rawInput }) => {
        const { name: sub, args } = parseSubcommand(rawInput);
        switch (sub) {
            case 'list':
            case '': {
                const agents = listAgents();
                if (agents.length === 0) {
                    return { kind: 'success', text: '（还没有自定义 agent — /agent create <name> 创建一个）' };
                }
                // 当前激活的 agent（状态栏方括号同款数据源）：default = 未套用预设。
                const current = globalThis
                    .__kiroControllerState?.()?.agent?.activeAgent ?? 'default';
                return { kind: 'success', text: renderAgentList(agents, current) };
            }
            case 'show': {
                const target = args[0];
                if (target === undefined)
                    return { kind: 'success', text: 'usage: /agent show <name>' };
                const match = findAgent(dirs(), target);
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
                // Honest subset: apply the preset's declared provider/model/effort to
                // the CURRENT session via the live model-switch machinery — the same
                // core the boot-time --agent / set-default activation uses.
                const target = args[0];
                if (target === undefined)
                    return { kind: 'success', text: 'usage: /agent swap <name>' };
                const match = findAgent(dirs(), target);
                if (match === undefined)
                    return { kind: 'error', text: `no agent named "${target}"` };
                let preset = {};
                try {
                    const parsed = JSON.parse(readFileSync(match.path, 'utf8'));
                    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        return { kind: 'error', text: `${match.path} 不是有效的 agent 定义（顶层必须是对象）` };
                    }
                    preset = parsed;
                }
                catch {
                    return { kind: 'error', text: `${match.path} 不是有效 JSON` };
                }
                const ctx = agent.ctx;
                // 引擎绑定来自 dsh-kiro 私有的 .dsh-kiro/agent-engines.json（kiro-cli 的
                // schema 不认识引擎字段，绝不能写进共享的 agent 定义文件）。
                const binding = getEngineBinding(process.cwd(), target);
                const effective = {
                    ...preset,
                    ...(binding !== undefined ? { engine: binding.engine, toolEngine: binding.toolEngine } : {}),
                };
                const applied = await applyAgentPreset(ctx, target, effective, {
                    injectTurn: (text) => {
                        const send = serviceOf(agent, 'kiroRetry');
                        // Detached submit: a platform-side assert here must NOT kill the
                        // TUI (bare setTimeout exceptions exit the process).
                        setTimeout(() => {
                            try {
                                send?.submit(text);
                            }
                            catch (error) {
                                const report = serviceOf(agent, 'kiroController');
                                report?.pushSystem?.(`✗ 人格指令发送失败：${error instanceof Error ? error.message : String(error)}`);
                            }
                        }, 0);
                    },
                });
                const lines = [`已切换到 agent「${target}」（${match.source} 级）：`];
                lines.push(applied.length > 0 ? `  ${applied.join(' · ')}` : '  未声明模型/档位，保持现状。');
                if (typeof preset.prompt === 'string' && preset.prompt !== '') {
                    lines.push('  人设长期生效建议：内容放入 .dsh-kiro/steering/ 后 /steering reload（工作区级）。');
                }
                return { kind: 'success', text: lines.join('\n') };
            }
            case 'create': {
                // kiro-cli shape: /agent create [NAME] [--description "..."] [--prompt "..."]
                const FLAGGED = new Set(['--name', '--description', '--prompt', '--directory', '--from']);
                // Positional name = the first token that is neither a flag nor a
                // flag's VALUE (`/agent create --prompt hello` must not name the
                // agent "hello").
                const positional = args.filter((arg, i) => {
                    if (arg.startsWith('-'))
                        return false;
                    const prev = args[i - 1];
                    return prev === undefined || !(FLAGGED.has(prev) || prev.startsWith('--'));
                });
                const name = flagValue(args, 'name') ?? positional[0];
                if (name === undefined || name.trim() === '') {
                    return { kind: 'error', text: 'usage: /agent create <name> [--description "..."] [--prompt "..."]' };
                }
                const clean = name.trim().replace(/\.json$/u, '');
                const description = flagValue(args, 'description') ?? '';
                const prompt = flagValue(args, 'prompt') ?? null;
                let target;
                try {
                    target = createAgent(dirs(), clean, description, prompt).path;
                }
                catch (error) {
                    return { kind: 'error', text: `/agent create: ${error instanceof Error ? error.message : String(error)}` };
                }
                if (prompt === null) {
                    // kiro-cli opens vim on the fresh config; do the same via $EDITOR.
                    const editor = pickEditor();
                    const result = spawnSync(editor, [target], { stdio: 'inherit' });
                    if (result.error !== undefined || result.status !== 0) {
                        return { kind: 'success', text: `已创建 ${target}（编辑器 ${editor} 没跑起来，可稍后 /agent edit ${clean}）` };
                    }
                }
                return { kind: 'success', text: `✔ 已创建 agent：${target}\n  用 /agent swap ${clean} 切换，/agent edit ${clean} 修改。` };
            }
            case 'edit': {
                const target = args.filter((arg) => !arg.startsWith('-'))[0];
                if (target === undefined)
                    return { kind: 'error', text: 'usage: /agent edit <name>' };
                const match = findAgent(dirs(), target);
                if (match === undefined)
                    return { kind: 'error', text: `no agent named "${target}"` };
                const result = spawnSync(pickEditor(), [match.path], { stdio: 'inherit' });
                if (result.error !== undefined || result.status !== 0) {
                    return { kind: 'error', text: `编辑器没跑起来：直接改 ${match.path}` };
                }
                return { kind: 'success', text: `✔ 已保存 ${match.path}（/agent swap ${target} 生效）` };
            }
            case 'delete': {
                const target = args.filter((arg) => !arg.startsWith('-'))[0];
                if (target === undefined)
                    return { kind: 'error', text: 'usage: /agent delete <name>' };
                let removed;
                try {
                    removed = deleteAgent(dirs(), target);
                }
                catch (error) {
                    return { kind: 'error', text: `/agent delete: ${error instanceof Error ? error.message : String(error)}` };
                }
                return { kind: 'success', text: `✔ 已删除 ${removed.path}` };
            }
            case 'rename': {
                const positional = args.filter((arg) => !arg.startsWith('-'));
                const [from, to] = positional;
                if (from === undefined || to === undefined)
                    return { kind: 'error', text: 'usage: /agent rename <old> <new>' };
                let renamed;
                try {
                    renamed = renameAgent(dirs(), from, to);
                }
                catch (error) {
                    return { kind: 'error', text: `/agent rename: ${error instanceof Error ? error.message : String(error)}` };
                }
                return { kind: 'success', text: `✔ ${from} → ${to}（${renamed.path}）` };
            }
            case 'set-default': {
                const target = args.filter((arg) => !arg.startsWith('-'))[0];
                if (target === undefined)
                    return { kind: 'error', text: 'usage: /agent set-default <name>' };
                if (findAgent(dirs(), target) === undefined)
                    return { kind: 'error', text: `no agent named "${target}"` };
                // 写入 dsh-kiro 私有的 .dsh-kiro/agent-engines.json —— 绝不写 kiro-cli 可能
                // 读取的共享文件（它的 schema 校验是严格的，未知字段会让它启动报错）。
                setDefaultAgent(process.cwd(), target);
                return { kind: 'success', text: `✔ 默认 agent → ${target}（写入 .dsh-kiro/agent-engines.json，下次启动生效）` };
            }
            case 'validate': {
                const target = flagValue(args, 'path') ?? args.filter((arg) => !arg.startsWith('-'))[0];
                if (target === undefined)
                    return { kind: 'error', text: 'usage: /agent validate <path-or-name>' };
                const match = findAgent(dirs(), target.replace(/\.json$/u, ''));
                const path = match?.path ?? target;
                if (!existsSync(path))
                    return { kind: 'error', text: `读不到 ${path}` };
                const result = validateAgentFile(path);
                if (!result.ok)
                    return { kind: 'error', text: `${path}: ${result.reason}` };
                return { kind: 'success', text: `✔ ${path} 是合法 JSON，name="${result.name}"` };
            }
            case 'set-engine': {
                // /agent set-engine <name> <kiro|dsh> [--rust]
                const positional = args.filter((arg) => !arg.startsWith('-'));
                const [engineName, unit] = positional;
                if (engineName === undefined || (unit !== 'kiro' && unit !== 'dsh')) {
                    return { kind: 'error', text: 'usage: /agent set-engine <name> <kiro|dsh> [--rust]\n  例：/agent set-engine testgary261106 kiro --rust' };
                }
                if (findAgent(dirs(), engineName) === undefined) {
                    return { kind: 'error', text: `no agent named "${engineName}"` };
                }
                const rust = args.includes('--rust') && unit === 'kiro';
                setEngineBinding(process.cwd(), engineName, { engine: unit, toolEngine: rust ? 'rust' : 'dsh' });
                return { kind: 'success', text: `✔ ${engineName} 引擎绑定 → ${unit}${rust ? ' + Rust 沙箱' : ''}（写入 .dsh-kiro/agent-engines.json，swap/启动时生效）` };
            }
            case 'clear-engine': {
                const target = args.filter((arg) => !arg.startsWith('-'))[0];
                if (target === undefined)
                    return { kind: 'error', text: 'usage: /agent clear-engine <name>' };
                const cleared = clearEngineBinding(process.cwd(), target);
                return cleared
                    ? { kind: 'success', text: `✔ 已清除 ${target} 的引擎绑定（恢复沿用当前引擎）。` }
                    : { kind: 'success', text: `${target} 本来就没有引擎绑定。` };
            }
            case 'generate': {
                // Model-authored definition: hand the description to the live model
                // as a structured turn — it has the file tools to write the JSON and
                // this TUI shows its work. `/agent generate` alone explains usage.
                const positional = args.filter((arg, i) => {
                    if (arg.startsWith('-'))
                        return false;
                    const prev = args[i - 1];
                    return prev === undefined || !prev.startsWith('--');
                });
                const description = positional.join(' ').trim();
                if (description === '') {
                    return { kind: 'error', text: 'usage: /agent generate <描述> [--name 名字]\n  例：/agent generate 专注 Rust 后端审查的助手 --name rust-reviewer' };
                }
                const name = flagValue(args, 'name') ?? positional[0] ?? `generated-${Date.now() % 100000}`;
                const target = join(AGENT_DIRS_FALLBACK(), `${name}.json`);
                if (existsSync(target)) {
                    return { kind: 'error', text: `已存在 ${target}（换个 --name，或先 /agent delete ${name}）` };
                }
                const send = serviceOf(agent, 'kiroRetry');
                if (send === undefined) {
                    return { kind: 'error', text: '/agent generate: 无法驱动模型（提交服务不可用）' };
                }
                const prompt = [
                    `请创建一个自定义 agent 定义文件：${target}`,
                    '',
                    '要求：',
                    '1. 严格使用以下 JSON 结构（字段与 kiro-cli 兼容，不要增删字段）：',
                    '   { "name": "...", "description": "...", "prompt": "...", "mcpServers": {}, "tools": ["*"], "toolAliases": {}, "allowedTools": [], "resources": [], "hooks": {}, "toolsSettings": {}, "includeMcpJson": false, "model": null }',
                    `2. name 字段必须是：${name}`,
                    `3. description：一句话概括这个 agent 的职责（基于下面的需求）`,
                    `4. prompt：为该 agent 写一段完整的系统提示（中文，按需求定制，300 字以内）`,
                    '',
                    `agent 需求：${description}`,
                    '',
                    '用文件工具写好文件后，简短确认文件路径即可。',
                ].join('\n');
                setTimeout(() => send.submit(prompt), 0);
                return {
                    kind: 'success',
                    text: [
                        `已把生成任务交给模型（写完后模型会确认）：`,
                        `  目标文件：${target}`,
                        `  需求：${description}`,
                        `  完成后用 /agent swap ${name} 启用。`,
                    ].join('\n'),
                };
            }
            case 'migrate':
                // Honest placeholder: migrate converts kiro profiles — phase 4.
                return { kind: 'success', text: '/agent migrate lands in phase 4.' };
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
                return { kind: 'success', text: '/agent <list|show|swap|create|edit|delete|rename|set-default|set-engine|clear-engine|validate|generate|schema|help> [name]\n  支持中文别名：生成/列表/切换/新建/编辑/删除/重命名/校验/查看\n  引擎绑定存于 .dsh-kiro/agent-engines.json（与 kiro-cli 完全隔离）' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /agent help.` };
        }
    },
};
//# sourceMappingURL=agent.js.map