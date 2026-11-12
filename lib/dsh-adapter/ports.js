/**
 * dsh-adapter — dsh-kiro 内核与 DSH 平台之间的**唯一**接触面。
 *
 * 设计定稿见 `docs/design/kernel-adapter.zh.md`。五条规则：
 *
 * 1. 内核代码（src/runtime|ui|commands|utils|skills|trust|…）**禁止** import
 *    `@deepseek-ai/*`——只允许 import 本目录（lint 强制）；
 * 2. Port 是**数据面**：类型全部是内核自有定义，DSH 协议形状只活在
 *    in-process 实现里，并在那里做容错翻译（未知块可见化，禁止静默丢）；
 * 3. Port 无安全决策权：审批/放行永远在内核；
 * 4. 每个 Port 有 in-process 实现（主）与备用实现的插槽（降级逃生舱）；
 * 5. 本文件不 import 任何 @deepseek-ai 包——它是内核可见的纯类型层。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/ports
 */
export {};
//# sourceMappingURL=ports.js.map