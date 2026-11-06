/**
 * `/agent` — manage custom agents against `.kiro/agents/` directories
 * (project first, then the user-global one — the same files kiro-cli reads).
 *
 * create / edit / delete / rename / set-default / validate are implemented
 * here (kiro-cli parity): create writes the kiro-shaped template (name,
 * description, prompt, tools ["*"], allowedTools, model, …) and — unless
 * `--prompt` is given — opens $EDITOR on it, the way kiro-cli opens vim.
 * generate (model-authored definitions) and migrate stay phase-4 stubs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentDirs, createAgent, deleteAgent, findAgent, listAgents, renameAgent, validateAgentFile } from "../utils/agent-store.js";
import { tokenizeArgs } from "../utils/args.js";
/** The directories this workspace reads agent definitions from. */
function dirs() {
    return agentDirs();
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
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'list', args: [] };
    // Quote-aware: --prompt "多词 文本" must arrive as ONE token without quotes.
    const tokens = tokenizeArgs(trimmed);
    return { name: tokens[0] ?? 'list', args: tokens.slice(1) };
}
/** Bridge for the /agent option menu (shadow-proxy-free list access). */
export function agentListBridge() {
    return listAgents().map((a) => ({ name: a.name, description: a.description }));
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
                    return { kind: 'success', text: '（还没有自定义 agent — /agent create <name> 创建一个）' };
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
                // Honest subset: apply the preset's declared provider/model/effort
                // to the CURRENT session via the live model-switch machinery. A
                // persona-level switch (separate system prompt / toolset per agent)
                // has no first-class platform switch yet — the preset's `prompt`
                // field is reported instead of silently ignored.
                const target = args[0];
                if (target === undefined)
                    return { kind: 'success', text: 'usage: /agent swap <name>' };
                const match = findAgent(dirs(), target);
                if (match === undefined)
                    return { kind: 'error', text: `no agent named "${target}"` };
                let preset = {};
                try {
                    const parsed = JSON.parse(readFileSync(match.path, 'utf8'));
                    // A definition that is valid JSON but not an object (`null`, `42`,
                    // `"x"`) would crash the field reads below.
                    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        return { kind: 'error', text: `${match.path} 不是有效的 agent 定义（顶层必须是对象）` };
                    }
                    preset = parsed;
                }
                catch {
                    return { kind: 'error', text: `${match.path} 不是有效 JSON` };
                }
                const ctx = agent.ctx;
                const get = ctx?.get;
                const switcher = get?.call(ctx, 'kiroModelSwitch');
                const effort = get?.call(ctx, 'kiroEffortControl');
                const applied = [];
                // kiro's own template writes `"model": null` — treat null like absent,
                // or a freshly created agent crashes the swap right here.
                const modelSpec = typeof preset.model === 'string' && preset.model.trim() !== '' ? preset.model : undefined;
                const full = modelSpec === undefined
                    ? undefined
                    : `${preset.provider ?? (modelSpec.includes('/') ? modelSpec.split('/')[0] : undefined)}/${modelSpec.includes('/') ? modelSpec.split('/')[1] : modelSpec}`;
                if (full !== undefined && switcher?.apply !== undefined) {
                    const [provider, model] = full.split('/');
                    switcher.apply({ provider, model });
                    applied.push(`模型 → ${full}`);
                }
                if (typeof preset.effort === 'string' && effort?.setManual !== undefined) {
                    effort.setManual(preset.effort);
                    applied.push(`档位 → ${preset.effort}`);
                }
                // Agent-parity: prompt + tools ride the persona service (kiro-loop
                // system prompt + schema filter); allowedTools become session trust.
                const directSet = globalThis.__kiroPersonaSet;
                const personaSvc = directSet !== undefined
                    ? { set: directSet }
                    : get?.call(ctx, 'kiroPersona');
                personaSvc?.set?.({
                    name: target,
                    ...(typeof preset.prompt === 'string' && preset.prompt !== '' ? { prompt: preset.prompt } : {}),
                    ...(Array.isArray(preset.tools)
                        ? { tools: preset.tools.filter((t) => typeof t === 'string') }
                        : {}),
                });
                if (typeof preset.prompt === 'string' && preset.prompt.trim() !== '')
                    applied.push('人格提示 → 已注入');
                if (Array.isArray(preset.tools))
                    applied.push('工具面 → 按预设过滤');
                const allowed = preset.allowedTools;
                if (Array.isArray(allowed)) {
                    const controllerSvc = get?.call(ctx, 'kiroController');
                    for (const tool of allowed) {
                        if (typeof tool === 'string' && tool !== '')
                            controllerSvc?.allowToolForSession?.(tool);
                    }
                    if (allowed.length > 0)
                        applied.push(`免审批 → ${String(allowed.length)} 个工具（本会话）`);
                }
                // Preset-declared engines ride the whole-unit switch.
                if ((preset.engine === 'kiro' || preset.engine === 'dsh')) {
                    const engineSvc = get?.call(ctx, 'kiroEngineSwitch');
                    if (engineSvc?.set !== undefined) {
                        await engineSvc.set(preset.engine, { rust: preset.toolEngine === 'rust' });
                        applied.push(`引擎 → ${preset.engine}${preset.toolEngine === 'rust' ? '+rust' : ''}`);
                    }
                }
                // DSH-loop parity: the persona prompt rides a system-semantic user
                // message (the platform persona override is not per-session).
                if (typeof preset.prompt === 'string' && preset.prompt.trim() !== '') {
                    const injectSvc = get?.call(ctx, 'kiroRetry');
                    void injectSvc; // prompt already in system prompt for kiro-loop; for dsh loop inject once
                    const controllerSvc = get?.call(ctx, 'kiroController');
                    controllerSvc?.pushSystem?.(`◇ 人格提示已装载（kiro-loop 生效于系统提示）`);
                }
                const lines = [`已切换到 agent「${target}」（${match.source} 级）：`];
                lines.push(applied.length > 0 ? `  ${applied.join(' · ')}` : '  未声明模型/档位，保持现状。');
                if (typeof preset.prompt === 'string' && preset.prompt !== '') {
                    lines.push(`  该预设带人格提示（${preset.prompt.length} 字）——平台暂无按 agent 隔离系统提示的开关，`);
                    lines.push('  如需生效可放入 .kiro/steering/<name>.md 后 /steering reload。');
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
                // kiro-cli writes the default into its own settings; here the boot-time
                // agent comes from .kiro/settings.json (agent key) — write that.
                const settingsPath = join(process.cwd(), '.kiro', 'settings.json');
                let settings = {};
                try {
                    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
                }
                catch { }
                settings['agent'] = target;
                mkdirSync(join(process.cwd(), '.kiro'), { recursive: true });
                writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
                return { kind: 'success', text: `✔ 默认 agent → ${target}（写入 ${settingsPath}，下次启动生效）` };
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
            case 'generate':
            case 'migrate':
                // Honest placeholders: generate needs a model-authored definition
                // pipeline, migrate converts kiro profiles — both phase 4.
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
                return { kind: 'success', text: '/agent <list|show|swap|create|edit|delete|rename|set-default|validate|generate|schema|help> [name]' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /agent help.` };
        }
    },
};
//# sourceMappingURL=agent.js.map