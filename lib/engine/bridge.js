/**
 * Rust engine bridge (P2): spawn `kiro-toold` per tool call — fresh process,
 * fresh Landlock restriction to the workspace root + /tmp, one JSON line in,
 * one JSON line out, hard process kill on timeout. Spawning per call (rather
 * than a long-lived daemon) is deliberate: each call gets a clean, minimal
 * kernel-level sandbox and a crash can never poison the next call.
 *
 * The binary lives at engine/target/release/kiro-toold (pnpm build:engine).
 * When absent, callers fall back to the platform tool pipeline.
 *
 * @module @damomoashidamomo/dsh-kiro/engine/bridge
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
let cachedBinary = null;
/** Locate the engine binary (null caching: looked up once per process). */
export function engineBinary() {
    if (cachedBinary !== null)
        return cachedBinary ?? undefined;
    const candidates = [
        join(process.cwd(), 'engine', 'target', 'release', 'kiro-toold'),
        // When the package is installed as a dependency the engine ships beside lib/.
        join(import.meta.url.replace(/[^/]*$/, ''), '..', '..', 'engine', 'target', 'release', 'kiro-toold'),
    ];
    cachedBinary = candidates.find((path) => existsSync(path)) ?? null;
    return cachedBinary ?? undefined;
}
/** Map a platform tool name + args onto the engine's tool surface. */
export function toEngineCall(name, args) {
    const record = (args ?? {});
    if (name === 'bash' || name === 'run_command' || name === 'execute_bash') {
        return { tool: 'execute_bash', args: record };
    }
    if (name === 'read' || name === 'read_file' || name === 'fs_read') {
        return { tool: 'fs_read', args: record };
    }
    if (name === 'write' || name === 'write_file' || name === 'fs_write') {
        return { tool: 'fs_write', args: record };
    }
    return undefined;
}
/** Run one call through a freshly sandboxed engine process. */
export function runEngineCall(call, workspaceRoot, timeoutMs = 120_000) {
    const binary = engineBinary();
    if (binary === undefined) {
        return Promise.resolve({ ok: false, error: 'engine binary not built (pnpm build:engine)' });
    }
    return new Promise((resolve) => {
        const child = spawn(binary, ['--rw', workspaceRoot], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: workspaceRoot,
        });
        let out = '';
        let settled = false;
        const finish = (reply) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            try {
                child.kill('SIGKILL');
            }
            catch {
                // already gone
            }
            resolve(reply);
        };
        const timer = setTimeout(() => finish({ ok: false, error: `engine timed out after ${timeoutMs}ms` }), timeoutMs);
        child.stdout.on('data', (chunk) => {
            out += chunk.toString('utf8');
            const newline = out.indexOf('\n');
            if (newline >= 0) {
                try {
                    finish(JSON.parse(out.slice(0, newline)));
                }
                catch {
                    finish({ ok: false, error: `engine reply parse failed: ${out.slice(0, newline).slice(0, 120)}` });
                }
            }
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString('utf8').trim();
            if (text !== '')
                finish({ ok: false, error: text.slice(0, 160) });
        });
        child.on('error', (error) => finish({ ok: false, error: `engine spawn failed: ${String(error)}` }));
        try {
            child.stdin.write(`${JSON.stringify({ id: 'bridge', tool: call.tool, args: call.args })}\n`);
            child.stdin.end();
        }
        catch (error) {
            finish({ ok: false, error: `engine write failed: ${String(error)}` });
        }
    });
}
//# sourceMappingURL=bridge.js.map