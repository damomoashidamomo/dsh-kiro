/**
 * in-process 适配器实现（主）：把内核 Port 调用翻译成当前 DSH 平台协议。
 *
 * 这里是全项目**唯一**合法 import `@deepseek-ai/*` 运行时形状的地方（类型
 * 经结构转型获取，不新增运行时依赖）。所有翻译都必须容错：
 * - 平台块 → 内核块：未知 type 记入 anomalies（可见化，禁止静默丢）；
 * - 字段缺失 → 安全缺省 + 计数；
 * - 平台服务缺失 → Port 返回 undefined 语义由调用方降级（与现状一致）。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/in-process
 */
import type { DialogAnswer, DialogApprovalOutcome, DialogApprovalRequest, DshAdapter, LlmChunk } from './ports';
/** 容错遥测收集器。 */
export declare class AnomalyCounter {
    private readonly counts;
    bump(kind: string): void;
    count(kind: string): number;
    snapshot(): Record<string, number>;
}
/** 把一个平台块翻译为内核块；无法识别的记入 anomalies 并返回 unknown 块。 */
export declare function translateLlmChunk(raw: unknown, anomalies: AnomalyCounter): LlmChunk;
/**
 * 组装 in-process 适配器。所有平台形状只在本函数闭包内出现。
 * 服务缺失时对应 Port 方法如实抛错/返回空——由内核按现状降级。
 */
export declare function createInProcessAdapter(platform: {
    llm?: {
        stream(options: unknown): AsyncIterable<unknown>;
    };
    tools?: {
        schemas(): {
            name: string;
        }[];
        register(def: unknown): () => void;
        execute(exec: unknown): Promise<unknown>;
    };
    userQuestions?: {
        ask(request: unknown): Promise<{
            answers: DialogAnswer[];
        }>;
    };
    approval?: (request: DialogApprovalRequest) => Promise<DialogApprovalOutcome>;
    onSessionEvent?: (handler: (event: unknown) => void) => () => void;
    onCommand?: (command: unknown) => () => void;
}): DshAdapter;
