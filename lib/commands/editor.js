/**
 * `/editor` — open `$EDITOR` (or `$VISUAL`, falling back to `vi`) to compose
 * a longer prompt. The composed text is dropped back into the prompt buffer.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
function pickEditor() {
    return process.env['EDITOR'] ?? process.env['VISUAL'] ?? (process.platform === 'win32' ? 'notepad' : 'vi');
}
export const editorCommand = {
    name: 'editor',
    description: 'Open $EDITOR to compose a longer prompt',
    handler: async () => {
        const editor = pickEditor();
        const dir = mkdtempSync(join(tmpdir(), 'dsh-kiro-editor-'));
        const file = join(dir, 'prompt.md');
        writeFileSync(file, '', 'utf8');
        const result = spawnSync(editor, [file], { stdio: 'inherit' });
        let text = '';
        try {
            text = readFileSync(file, 'utf8').trim();
        }
        catch {
            text = '';
        }
        try {
            unlinkSync(file);
        }
        catch { /* ignore */ }
        if (result.error !== undefined) {
            return { kind: 'error', text: `editor failed: ${result.error.message}` };
        }
        if (text === '')
            return { kind: 'success', text: '(empty — editor exited without writing)' };
        return { kind: 'success', text: `editor returned ${text.length} chars. Re-submit as a prompt to send it to the agent.` };
    },
};
//# sourceMappingURL=editor.js.map