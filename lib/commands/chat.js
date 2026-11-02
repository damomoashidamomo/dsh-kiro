/**
 * `/chat` — manage saved sessions: list, resume, switch, delete.
 *
 * Reads headers directly from `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`
 * via {@link import("../utils/sessions.js").listSessions}, which keeps the
 * dependency surface narrow (no `dsh-session-query-sqlite` plumbing). By
 * default the listing only shows sessions whose working directory matches
 * (or is a parent of) the current `cwd` — most users only want their own
 * recent sessions.
 *
 * `resume`/`new` switch sessions IN PLACE through the `kiroSessionSwitch`
 * service (flush + dispose + agents.resume/create + transcript replay) —
 * no exit/restart needed. `--resume`/`--resume-id` remain boot-time
 * equivalents handled by `startup.ts` + the runtime mount.
 */
import { deleteSession, filterSessions, formatTimestamp, listSessions, } from "../utils/sessions.js";
function switchServiceOf(agentCtx) {
    const ctx = agentCtx.ctx;
    if (ctx === undefined || ctx === null)
        return undefined;
    const get = ctx.get;
    return typeof get === 'function'
        ? get.call(ctx, 'kiroSessionSwitch')
        : undefined;
}
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'list', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'list', args: tokens.slice(1) };
}
/** Render the listing table. */
function listText(rows, opts) {
    if (rows.length === 0) {
        return opts.all
            ? '(no sessions under $DSH_HOME/sessions)'
            : '(no sessions for the current working directory — pass `--all` to see every session on disk)';
    }
    const header = `${rows.length.toString().padStart(4)} session(s):`;
    const lines = [header];
    for (const row of rows.slice(0, 50)) {
        const date = formatTimestamp(row.createdAt);
        const cwd = row.cwd === '' ? '(no cwd)' : row.cwd;
        lines.push(`  ${row.id.padEnd(40)}  ${date}  ${cwd}`);
    }
    if (rows.length > 50)
        lines.push(`  … and ${rows.length - 50} more`);
    return lines.join('\n');
}
/** Short resume hint when no id was given: the recent sessions for this cwd. */
function resumeHint() {
    const rows = filterSessions(listSessions()).slice(0, 5);
    const lines = ['usage: /chat resume <session-id>  —  在当前 TUI 内直接切换，无需重启'];
    if (rows.length === 0) {
        lines.push('（当前目录还没有历史会话；/chat list --all 查看全部）');
        return lines.join('\n');
    }
    lines.push('当前目录最近的会话：');
    for (const row of rows) {
        lines.push(`  ${row.id}  ${formatTimestamp(row.createdAt)}`);
    }
    return lines.join('\n');
}
export const chatCommand = {
    name: 'chat',
    description: 'Manage sessions: list, resume, switch, delete',
    input: { hint: '<list|resume|new|delete> [args]' },
    handler: async ({ agent, rawInput }) => {
        const { name: sub, args } = parseSubcommand(rawInput);
        switch (sub) {
            case 'new': {
                const service = switchServiceOf(agent);
                if (service === undefined) {
                    return { kind: 'error', text: '/chat new: 会话切换服务不可用' };
                }
                const result = await service.switchTo(undefined);
                return result.ok
                    ? { kind: 'success', text: '◇ 已开启新会话。' }
                    : { kind: 'error', text: result.message };
            }
            case 'list':
            case '': {
                const all = args.includes('--all');
                const summaries = listSessions();
                const filtered = all ? summaries : filterSessions(summaries);
                return { kind: 'success', text: listText(filtered, { all }) };
            }
            case 'resume': {
                const id = args[0];
                if (id === undefined)
                    return { kind: 'success', text: resumeHint() };
                const service = switchServiceOf(agent);
                if (service === undefined) {
                    return { kind: 'error', text: '/chat resume: 会话切换服务不可用' };
                }
                const result = await service.switchTo(id);
                return result.ok
                    ? { kind: 'success', text: result.message }
                    : { kind: 'error', text: result.message };
            }
            case 'delete': {
                const target = args[0];
                if (target === undefined)
                    return { kind: 'success', text: 'usage: /chat delete <session-id>' };
                const removed = deleteSession(target);
                return removed
                    ? { kind: 'success', text: `deleted session ${target}` }
                    : { kind: 'error', text: `no session found for "${target}"` };
            }
            case 'help':
                return { kind: 'success', text: '/chat <list|resume|new|delete> [args]\n  list [--all]        list sessions for this cwd (or all with --all)\n  resume <id>         在当前 TUI 内切换到该会话（回放最近 300 条事件）\n  new                 存盘当前会话并开启新会话\n  delete <id>         删除一个存盘会话' };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /chat help.` };
        }
    },
};
export { listText };
//# sourceMappingURL=chat.js.map