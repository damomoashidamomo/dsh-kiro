/**
 * `/copy` — 方案 B：把最近的代码块写进剪贴板（OSC 52）。
 *
 *   /copy           列出最近 10 个代码块（编号/语言/预览/时间）
 *   /copy 2         第 2 块写入剪贴板（同时回显全文，终端不支持 OSC 52 时
 *                   仍可手动选择回显区）
 *
 * @module @damomoashidamomo/dsh-kiro/commands/copy
 */
import { codeBlockByN, osc52Sequence, recentCodeBlocks } from "../runtime/code-registry.js";
function preview(entry) {
    const first = entry.text.split('\n')[0] ?? '';
    const clip = first.length > 52 ? `${first.slice(0, 51)}…` : first;
    const age = Math.max(1, Math.round((Date.now() - entry.at) / 1000));
    const when = age < 60 ? `${age}s 前` : `${Math.round(age / 60)}m 前`;
    return `${clip}  ${when}${entry.file !== undefined ? ' · 已落盘' : ''}`;
}
export const copyCommand = {
    name: 'copy',
    description: '把最近代码块复制到剪贴板（/copy 列表；/copy <n> 复制）',
    input: { hint: '[<n>]' },
    handler: async ({ rawInput }) => {
        const arg = rawInput.trim();
        if (arg === '') {
            const rows = recentCodeBlocks(10);
            if (rows.length === 0) {
                return { kind: 'success', text: '还没有登记的代码块（发送含 ``` 围栏的消息后可用）。' };
            }
            const lines = ['最近的代码块（/copy <编号> 复制到剪贴板）：'];
            for (const entry of rows) {
                lines.push(`  ${entry.n}  ${entry.lang !== '' ? entry.lang : 'text'}   ${preview(entry)}`);
            }
            return { kind: 'success', text: lines.join('\n') };
        }
        const n = Number.parseInt(arg, 10);
        if (!Number.isInteger(n) || n < 1) {
            return { kind: 'error', text: 'usage: /copy [<编号>]（无参数列出最近代码块）' };
        }
        const entry = codeBlockByN(n);
        if (entry === undefined) {
            return { kind: 'error', text: `没有第 ${n} 块（/copy 查看现有编号）` };
        }
        // OSC 52 写剪贴板；同时回显全文——不支持 OSC 52 的终端仍可手动复制回显。
        process.stdout.write(osc52Sequence(entry.text));
        const lines = [
            `✓ 已发送剪贴板写入（第 ${n} 块，${entry.text.split('\n').length} 行）。`,
            '  支持的终端（Windows Terminal/Kitty/iTerm2/tmux）已直接进剪贴板；',
            '  若没生效，下面是全文，可手动选择：',
            '',
            entry.text,
        ];
        if (entry.file !== undefined)
            lines.push('', `（长块已落盘：${entry.file}）`);
        return { kind: 'success', text: lines.join('\n') };
    },
};
//# sourceMappingURL=copy.js.map