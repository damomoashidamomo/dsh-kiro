/**
 * faux 假模型供应商（pi 模式）：确定性 LlmPort，测试用。
 *
 * 用法：`DSH_KIRO_FAUX_LLM=/path/script.json`。脚本格式：
 *
 *   { "turns": [ [ {"text": "你好"}, {"tool": {"name": "write",
 *              "arguments": {"path": "a.txt", "content": "ok"}}},
 *              {"text": "写完了"} ], ... ] }
 *
 * 第 N 次 stream() 调用消费第 N 个 turn（超出则空文本结束）。工具调用会被
 * 内核真实执行（审批面板照常弹）——PTY 测试因此能在**零真实模型**下走完
 * 完整交互链路，根除 LIVE 限流抖动。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/faux
 */
import { readFileSync } from 'node:fs';
/** 解析 faux 脚本；坏脚本直接抛错（fail-loud：测试配置错误必须立刻暴露）。 */
export function parseFauxScript(raw) {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.turns)) {
        throw new Error('faux script: 顶层必须是 {"turns": [[step...], ...]}');
    }
    return parsed;
}
/** 构造 faux LlmPort。 */
export function createFauxLlmPort(script) {
    let cursor = 0;
    return {
        stream(request) {
            const index = cursor;
            cursor += 1;
            const steps = script.turns?.[index] ?? [];
            async function* replay() {
                // 首块模拟首字延迟为零：测试要快。
                for (const step of steps) {
                    if (typeof step.reasoning === 'string' && step.reasoning !== '') {
                        yield { type: 'reasoning-delta', text: step.reasoning };
                    }
                    if (typeof step.text === 'string' && step.text !== '') {
                        yield { type: 'text-delta', text: step.text };
                    }
                    if (step.tool !== undefined && typeof step.tool.name === 'string') {
                        yield {
                            type: 'tool-call',
                            id: `faux-${index}-${Math.random().toString(36).slice(2, 8)}`,
                            name: step.tool.name,
                            arguments: JSON.stringify(step.tool.arguments ?? {}),
                        };
                    }
                    if (typeof step.error === 'string' && step.error !== '') {
                        yield { type: 'finish', reason: 'error', failureMessage: step.error };
                        return;
                    }
                }
                yield { type: 'finish', reason: 'stop' };
            }
            void request;
            return replay();
        },
    };
}
/** 从环境变量装载 faux（未设置返回 undefined）。 */
export function fauxLlmFromEnv(env = process.env) {
    const path = env.DSH_KIRO_FAUX_LLM;
    if (path === undefined || path.trim() === '')
        return undefined;
    return createFauxLlmPort(parseFauxScript(readFileSync(path, 'utf8')));
}
//# sourceMappingURL=faux.js.map