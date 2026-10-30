import { readdirSync, statSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
/** Workspace-relative directory the oversized-paste spill writes into. */
const PASTE_DIR = join('.kiro', 'paste');
/** List `paste-*.txt` spill files, newest first; undefined when unreadable. */
function listPasteFiles(cwd) {
    const dir = join(cwd, PASTE_DIR);
    let names;
    try {
        names = readdirSync(dir);
    }
    catch {
        return undefined;
    }
    const files = [];
    for (const name of names) {
        if (!name.startsWith('paste-') || !name.endsWith('.txt'))
            continue;
        try {
            const stat = statSync(join(dir, name));
            if (!stat.isFile())
                continue;
            files.push({ name, bytes: stat.size, mtimeMs: stat.mtimeMs });
        }
        catch {
            // Vanished between readdir and stat — skip it.
        }
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files;
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
function formatTime(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function usage() {
    return {
        kind: 'error',
        text: 'usage: /paste list   列出 .kiro/paste/ 落盘的粘贴文件\n       /paste clean  删除全部落盘粘贴文件',
    };
}
/**
 * /paste — manage the oversized-paste spill files that Prompt writes into
 * `<workspace>/.kiro/paste/paste-<stamp>.txt` (see `spillPaste`).
 *
 *   /paste          list the spilled files (same as `/paste list`)
 *   /paste list     list them: name, size, modification time, newest first
 *   /paste clean    delete every paste-*.txt file (other files in the
 *                   directory are left alone); removes the directory when it
 *                   ends up empty
 *
 * The draft's `@.kiro/paste/…` mentions are only path references — cleaning
 * the files means a draft that still references one must be re-pasted.
 */
export const pasteCommand = {
    name: 'paste',
    description: 'List / clean oversized-paste spill files',
    input: { hint: '[list|clean]' },
    handler: async ({ agent, rawInput }) => {
        const session = agent.session;
        const cwd = session?.header?.cwd ?? process.cwd();
        const dir = join(cwd, PASTE_DIR);
        const parts = rawInput.trim().split(/\s+/u).filter(Boolean);
        const sub = parts[0] ?? 'list';
        if (sub === 'list' || parts.length === 0) {
            const files = listPasteFiles(cwd);
            if (files === undefined || files.length === 0) {
                return { kind: 'success', text: `${dir} 下没有落盘的粘贴文件。` };
            }
            const lines = [`落盘粘贴文件（${files.length}，${dir}）：`];
            files.forEach((f, i) => {
                lines.push(`  ${i + 1}. ${f.name} · ${formatBytes(f.bytes)} · ${formatTime(f.mtimeMs)}`);
            });
            lines.push('');
            lines.push('用 /paste clean 删除全部；编辑草稿里的 @.kiro/paste/… 引用需要重新粘贴内容。');
            return { kind: 'success', text: lines.join('\n') };
        }
        if (sub === 'clean') {
            const files = listPasteFiles(cwd);
            if (files === undefined || files.length === 0) {
                return { kind: 'success', text: `${dir} 下没有落盘的粘贴文件，无需清理。` };
            }
            let removed = 0;
            for (const f of files) {
                try {
                    unlinkSync(join(dir, f.name));
                    removed += 1;
                }
                catch {
                    // Already gone — nothing to do.
                }
            }
            // Remove the directory only when the spill files were all it held.
            try {
                rmdirSync(dir);
            }
            catch {
                // Not empty (other files) — leave it.
            }
            return {
                kind: 'success',
                text: `已删除 ${removed}/${files.length} 个落盘粘贴文件。`,
            };
        }
        return usage();
    },
};
//# sourceMappingURL=paste.js.map