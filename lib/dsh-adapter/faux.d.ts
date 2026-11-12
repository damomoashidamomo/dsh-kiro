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
import type { LlmPort } from './ports';
interface FauxStep {
    readonly text?: string;
    readonly reasoning?: string;
    readonly tool?: {
        readonly name: string;
        readonly arguments?: unknown;
    };
    readonly error?: string;
}
interface FauxScript {
    readonly turns?: readonly (readonly FauxStep[])[];
}
/** 解析 faux 脚本；坏脚本直接抛错（fail-loud：测试配置错误必须立刻暴露）。 */
export declare function parseFauxScript(raw: string): FauxScript;
/** 构造 faux LlmPort。 */
export declare function createFauxLlmPort(script: FauxScript): LlmPort;
/** 从环境变量装载 faux（未设置返回 undefined）。 */
export declare function fauxLlmFromEnv(env?: NodeJS.ProcessEnv): LlmPort | undefined;
export {};
