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
import type { LlmPort } from './ports';
/** 递归护栏环境变量（headless 子进程内置位）。 */
export declare const HEADLESS_GUARD_ENV = "DSH_KIRO_HEADLESS_ACTIVE";
export interface HeadlessOptions {
    /** 命令行（默认 dsh --profile kiro --no-interactive）。 */
    readonly command?: readonly string[];
    /** 子进程 cwd（默认 process.cwd()）。 */
    readonly cwd?: string;
    /** 超时毫秒（默认 10 分钟）。 */
    readonly timeoutMs?: number;
}
/** 把内核消息列表序列化为 headless 任务文本。 */
export declare function serializeTask(request: {
    system: string;
    messages: readonly {
        role?: unknown;
        text?: unknown;
    }[];
}): string;
/** 组装 headless LlmPort。 */
export declare function createHeadlessLlmPort(options?: HeadlessOptions): LlmPort;
