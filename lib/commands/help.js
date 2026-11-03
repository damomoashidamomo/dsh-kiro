/**
 * `/help` — the readable, current-state guide: hotkeys, the two-layer engine
 * model (loop + tool engine), the safety stack, and every command. Chinese
 * first with English one-liners for the key rows, so both-language readers
 * can navigate. Command descriptions themselves stay bilingual in the
 * registry.
 */
import { groupCommands } from "./registry.js";
export const helpCommand = {
    name: 'help',
    description: 'Show the guide: hotkeys, engines, safety, all commands / 帮助总览',
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
            return { kind: 'success', text: `No command named "${query}". Try /help for the full list.` };
        }
        const lines = [];
        lines.push('━━━ 1 · 快捷键与输入 / Hotkeys & Input ━━━');
        lines.push('  Enter            提交；回合运行中提交 = 中途插话（下一步生效）/ submit or steer mid-turn');
        lines.push('  ↑ / ↓            弹窗打开时移动 ▸ 高亮（Enter 执行选中项）；否则翻阅输入历史');
        lines.push('  ← / → / Home/End 移动输入光标（真实终端光标即输入位）/ move the caret');
        lines.push('  Tab              选中弹窗当前项 / commit the highlighted candidate');
        lines.push('  Ctrl+C           第一段：取消当前回合；空闲时按一次退出 / cancel turn, or exit when idle');
        lines.push('  / 前缀           命令补全弹窗；@ 前缀 文件引用补全；! 前缀 直通宿主 shell');
        lines.push('  粘贴             超过 8KB 自动落盘 .kiro/paste/ 并以 @ 引用 / big pastes spill to disk');
        lines.push('');
        lines.push('━━━ 2 · 双层引擎模型 / The Two Engine Layers ━━━');
        lines.push('  /loop 决定「谁来驱动回合」/ who drives each turn:');
        lines.push('    /loop dsh   — DSH 平台 agent loop（默认，平台全套）/ the platform loop (default)');
        lines.push('    /loop kiro  — dsh-kiro 自研循环（工具回填·并行·重试·自动压缩）/ the own loop');
        lines.push('  /tools 决定「bash/读写由谁执行」/ who executes tools (only under /loop kiro):');
        lines.push('    /tools dsh  — 平台工具管线（平台沙箱 + 审批）/ platform pipeline');
        lines.push('    /tools rust — Rust 引擎：每次调用一个 Landlock 内核级沙箱进程');
        lines.push('                   （只许写工作区与 /tmp，全盘只读；越界由内核拒绝）');
        lines.push('  裸敲 /loop 可一眼看到两层当前状态与 rust 可用性。');
        lines.push('');
        lines.push('━━━ 3 · 安全栈 / The Safety Stack ━━━');
        lines.push('  ① toolsSettings   .kiro/tools.json：allowed/denied（命令整串正则、路径 glob、');
        lines.push('                    只读命令自动放行；deny 优先）/ kiro-cli-compatible matrix');
        lines.push('  ② 审批面板        1 允许一次 · 2 本会话 · 3 本项目（.kiro/approvals.json）· 4 拒绝；');
        lines.push('                    信任范围二级选择：整工具/仅此命令/命令前缀；edit 类显示红绿 diff');
        lines.push('                    /approvals 查看与移除已记住的信任');
        lines.push('  ③ 变更护栏        生产/仓库外改动先陈述计划与影响面，等你批准；说「直接做」豁免当轮');
        lines.push('  ④ Landlock       /tools rust 时的内核级兜底（进程自限，不影响系统其它服务）');
        lines.push('  权限预设 /permission：read-only / workspace-write / danger-full-access（状态栏徽章）');
        lines.push('');
        lines.push('━━━ 4 · 常用能力 / Everyday Features ━━━');
        lines.push('  思考档位 /effort   auto（关键词自动升档）/ low / high / max；/effort probe 实测网关');
        lines.push('  技能 /skills      像 /model 一样选择性加载技能（.kiro/skills.json 持久化）');
        lines.push('  会话 /chat        resume <id> 在 TUI 内直接切换并回放历史；new 开新会话；list 看简介');
        lines.push('  Todo / 思考       模型可调 kiro_todo_write（转录实时清单）与 kiro_think（思考草稿）');
        lines.push('  Steering/Hooks    .kiro/steering/*.md 与 .kiro/hooks.json，均支持 reload 热重载');
        lines.push('  失败反馈          超时/限流/网络错误分类提示 + /retry 一键重发');
        lines.push('  /doctor           一键体检：版本/服务/ink 补丁/档位来源/终端能力');
        lines.push('  /paste list|clean 管理落盘的大段粘贴');
        lines.push('');
        lines.push('━━━ 5 · 全部命令 / All Commands ━━━');
        for (const group of groups) {
            lines.push('');
            lines.push(` ${group.title}:`);
            for (const cmd of group.items) {
                const hint = cmd.input?.hint !== undefined ? ` ${cmd.input.hint}` : '';
                lines.push(`  /${cmd.name.padEnd(14)}${hint}  ${cmd.description}`);
            }
        }
        return { kind: 'success', text: lines.join('\n') };
    },
};
//# sourceMappingURL=help.js.map