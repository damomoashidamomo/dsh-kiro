/**
 * A3：headless 自动降级 LlmPort。
 *
 * 当平台 llm 服务不可用（DSH 大版本破坏进程内适配器）时，回合自动降级为
 * 子进程 headless 通道：把对话序列化进 0600 私有任务文件（绝不进 argv），
 * 调 `dsh --profile kiro --no-interactive "<固定句子>"`，把最终输出作为
 * 一个 text-delta + finish 回放。如实降级（无流式、无审批面板交互）。
 *
 * 递归护栏：headless 子进程自身若再见 llm 缺失，不得再次降级（否则无限
 * 递归）——子进程带 DSH_KIRO_HEADLESS_ACTIVE=1，boot 端见到即拒绝降级。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/headless-llm
 */
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/** 递归护栏环境变量（headless 子进程内置位）。 */
export const HEADLESS_GUARD_ENV = 'DSH_KIRO_HEADLESS_ACTIVE';
/** 把内核消息列表序列化为 headless 任务文本。 */
export function serializeTask(request) {
    const lines = [];
    if (request.system.trim() !== '')
        lines.push(`[系统提示] ${request.system.trim()}`);
    for (const message of request.messages) {
        const role = message.role === 'assistant' ? '助手' : '用户';
        const text = typeof message.text === 'string' ? message.text : JSON.stringify(message);
        lines.push(`[${role}] ${text}`);
    }
    return lines.join('\n');
}
/** 组装 headless LlmPort。 */
export function createHeadlessLlmPort(options = {}) {
    const argv = options.command ?? ['dsh', '--profile', 'kiro', '--no-interactive'];
    const timeoutMs = options.timeoutMs ?? 600_000;
    return {
        stream(request) {
            async function* replay() {
                const task = serializeTask({ system: request.system, messages: request.messages });
                // 0600 私有任务文件；写不了就 fail-closed（绝不把任务放进 argv）。
                const dir = mkdtempSync(join(tmpdir(), 'dsh-kiro-headless-'));
                const taskFile = join(dir, 'task.txt');
                try {
                    writeFileSync(taskFile, task, { mode: 0o600 });
                    chmodSync(taskFile, 0o600);
                }
                catch (error) {
                    yield { type: 'finish', reason: 'error', failureMessage: `headless: 任务文件写入失败（fail-closed）：${error instanceof Error ? error.message : String(error)}` };
                    return;
                }
                try {
                    const output = await new Promise((resolve, reject) => {
                        const child = spawn(argv[0], [...argv.slice(1), `请完成私有任务文件 ${taskFile} 中描述的任务，直接输出结果。`], {
                            cwd: options.cwd ?? process.cwd(),
                            env: { ...process.env, [HEADLESS_GUARD_ENV]: '1' },
                            stdio: ['ignore', 'pipe', 'pipe'],
                        });
                        let stdout = '';
                        let stderr = '';
                        const timer = setTimeout(() => {
                            child.kill('SIGKILL');
                            reject(new Error(`headless: 超时（${Math.round(timeoutMs / 1000)}s）`));
                        }, timeoutMs);
                        child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
                        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
                        child.on('close', (code) => {
                            clearTimeout(timer);
                            if (code === 0 && stdout.trim() !== '')
                                resolve(stdout.trim());
                            else
                                reject(new Error(`headless: exit=${code} ${stderr.trim().slice(0, 160)}`));
                        });
                        child.on('error', (error) => { clearTimeout(timer); reject(error); });
                    });
                    if (output !== '')
                        yield { type: 'text-delta', text: output };
                    yield { type: 'finish', reason: 'stop' };
                }
                catch (error) {
                    yield { type: 'finish', reason: 'error', failureMessage: error instanceof Error ? error.message : String(error) };
                }
                finally {
                    try {
                        unlinkSync(taskFile);
                    }
                    catch { /* cleaned */ }
                }
            }
            return replay();
        },
    };
}
//# sourceMappingURL=headless-llm.js.map