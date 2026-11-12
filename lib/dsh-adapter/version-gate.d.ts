/**
 * DSH 版本门禁（P2.5，openagents 模式）。
 *
 * 原则：**已知不兼容 → fail-closed**（阻塞新回合并如实说明），未知版本 →
 * 放行但把版本号写进可诊断处。已知不兼容清单：
 *  1. 内置 KNOWN_BAD（默认空——出现破坏性版本时加一条即可热修）；
 *  2. 环境变量 DSH_KIRO_DSH_COMPAT 覆盖，格式 `bad:1.2.3,1.2.4;min:0.9.0`
 *     （升级演练/应急用，不用发版）。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/version-gate
 */
/** 门禁判定结果。 */
export interface GateVerdict {
    readonly ok: boolean;
    readonly version: string | undefined;
    readonly reason: string | undefined;
}
/** 解析 `bad:1.2.3,1.2.4;min:0.9.0` 形式的覆盖配置。 */
export declare function parseCompatOverride(raw: string | undefined): {
    bad: readonly string[];
    min: string | undefined;
};
/** 探测当前运行时的平台版本（读 profile 内实际装载的 cordis 包版本）。 */
export declare function detectPlatformVersion(): string | undefined;
/** 语义化前缀比较：a < b → -1（只比数字段， prerelease 视为更低）。 */
export declare function compareVersions(a: string, b: string): number;
/**
 * 评估门禁。version 检测不到时：放行但 reason 标注"无法检测"（不因探测
 * 失败阻塞——那会让门禁本身变成新的单点故障）。
 */
export declare function evaluateGate(version: string | undefined, override?: string | undefined): GateVerdict;
