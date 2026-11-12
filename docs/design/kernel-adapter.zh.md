# dsh-kiro 内核与 DSH 适配层设计（方向定稿 v1）

> 状态：**已与用户对齐的方向定稿**（2026-11）。本文是所有其他文档的"北极星"：
> 与本文冲突的旧描述以本文为准。实施排期见文末 P1-P4 与 `docs/backlog.zh.md`。

## 0. 项目初衷（北极星，用户钦定）

> **核心功能使用 dsh-kiro 自研内核；外部工具类能力走 DSH；dsh-kiro 作为一个
> DSH 外接 agent，通过尽量少、尽量通用的接口接在 DSH 上；不随 DSH 版本
> 更新而崩溃，可兼容 DSH 各个版本。**

配套的永续设计原则（历史钦定，继续有效）：与 kiro-cli 同级甚至更可控；
**权限粒度越细越好、人工参与越多越好**——不让 agent 放飞自我做错事情。

## 1. 技术栈决策记录（ADR-001）

**结论：维持现有栈，它是当前主流最新一代，不换栈。**

| 层 | 选型 | 依据（2026-11 核查） |
|---|---|---|
| 语言/运行时 | TypeScript + Node 22 | 与 Claude Code、pi-mono 同代；kiro-cli TUI 模式同为 TS |
| TUI | React + **Ink 5.2.1（自研补丁版，随 profile 固定）** | Claude Code / kiro-cli TUI 同族；补丁解决光标定位/重绘（上游不会替我们修） |
| 工具引擎 | **Rust 独立进程 + Landlock 沙箱** | kiro-cli classic 同思路；pi 默认**无沙箱**——我们的安全差异化优势 |
| 测试 | vitest + PTY E2E + LIVE 审计 | pi 的 faux 供应商模式将引入（见 §5） |

明确否决的替代方案：Go/Bubbletea、Rust/Ratatui（kiro-cli 正是从 Rust 直通 UI 迁到 Ink）；全量 vendor 平台件（失去平台能力）；整个循环独立进程化（面板交互割裂）。

**择机吸收的现代实践**（P4，非紧迫）：TypeBox+AJV 工具 schema（pi 模式）；
缓冲工具输出 `+N 行(ctrl+o)` 折叠（kiro-cli 模式）；分段输入模型——文本/
文件 chip/折叠粘贴 chip（kiro-cli 与 Claude Code 共同方向，我们的 @ 引用 +
粘贴落盘是雏形）。

## 2. 总体架构：内核 + 五口适配层

```
┌─ dsh-kiro 内核（平台无关，永续资产）─────────────────────────┐
│ 回合循环 kiro-loop（默认引擎 kiro/rust，0.8.0 起）            │
│ Rust 工具引擎桥（Landlock）· 审批/提问面板 · agent/技能/       │
│ steering/hooks/trust/knowledge/checkpoint/spec · 全部 TUI     │
│ 数据家：~/.dsh-kiro 与 <工作区>/.dsh-kiro（与 kiro-cli 零关联）│
└──────────────┬───────────────────────────────────────────────┘
               │ 内核只允许依赖以下 5 个 Port 接口（src/dsh-adapter/）
┌──────────────▼───────────────────────────────────────────────┐
│ dsh-adapter —— 全项目唯一允许认识 DSH 的地方                   │
│ ① LlmPort     模型流式调用（chunk 协议容错解析，未知块可见化）  │
│ ② ToolsPort   工具注册 + 非内核工具执行（web_search 等）        │
│ ③ DialogPort  问题/审批瀑布（答案类型为内核自有定义）           │
│ ④ SessionPort 会话存取（v3/v4 双读；自有 JSON 导出为最终归属）  │
│ ⑤ CommandPort 命令与参数注册（cordis 装配点）                  │
└──────────────┬───────────────────────────────────────────────┘
               ▼
        DeepSeek Harness 平台
```

### 2.1 内核纪律（强制）

- 内核目录（`src/runtime|ui|commands|utils|skills|trust|…`）**禁止 import
  `@deepseek-ai/*`**（适配层除外）——用 lint 规则 + CI 强制，违者红灯；
- 内核单元测试（当前 424 个）**零 DSH 依赖**——内核正确性可独立于平台证明；
- Port 是**数据面不是控制面**：审批权、工具放行权永远在内核。适配层无权
  做任何安全决策。

### 2.2 双适配器实现（降级逃生舱）

| 实现 | 状态 | 能力 |
|---|---|---|
| `in-process`（cordis 插件，现行） | 主 | 全功能：流式、审批瀑布、面板、会话恢复 |
| `headless-subprocess`（子进程驱动 dsh headless profile） | 备（P3 骨架） | 无流式/无审批面板的降级模式 |

市面第三方 DSH TUI（@mcswift/dsh-tui、@xmoon76/dsh-pi-tui、openagents 的
dsh 适配）**全部只能走 headless 子进程**——因为 headless 无流式、无会话恢复、
任务只能走 argv。这反证 dsh-kiro 的进程内接入是独有优势；同时借鉴他们验证过
的做法：DSH 大版本破坏进程内契约时，自动降级到 headless 适配器**保持可用**，
修好主适配器再切换回来。

### 2.3 跨版本兼容三件套

1. **契约测试**：把"我们对 DSH 协议的全部假设"（llm chunk 形状、事件词汇、
   skills candidate 结构、session 帧格式、命令服务签名）写成显式测试——
   DSH 升级后先跑契约，一眼看出哪条假设破了，只改适配层；
2. **版本门禁**（openagents 模式）：启动时检测 DSH 版本；命中已知不兼容版本
   → 如实拒绝 + 提示（fail-closed），而不是运行中随机崩；
3. **协议容错**：每个 Port 的解析都防御性——字段缺失/改名时兜底降级 + 计数
   告警（未知 chunk 类型必须**可见**，禁止静默丢数据）。

### 2.4 防不住的东西（诚实边界，写进设计）

适配层防**协议形状**变化，防不住**语义**漂移（DSH 改的是行为而非结构）。
唯一解药是端到端行为审计——**PTY E2E + LIVE 交互审计套件长期保留**，与
契约测试互补（契约管结构，审计管行为）。实证：平台默认权限策略差异导致
审批行为漂移，任何适配层都拦不住，靠的是行为审计抓出来的。

## 3. 引擎与权限（0.8.0 定稿）

- **默认引擎 kiro/rust**（kiro 循环 + Rust Landlock 工具引擎）；Rust 二进制
  缺失自动回落 DSH 工具管线并如实提示；`--engine dsh` 与 `/loop dsh` 保留
  为显式逃生口。动机：双循环并存 = 审批策略/状态标签不一致的 bug 温床
  （`[kiro/rust]` 标签说谎 bug 即源于此）；
- 审批矩阵：**只读/模型辅助工具静默**（read/grep/glob/skill/todo/think，
  kiro-cli 惯例）；写/bash 走审批面板；toolsSettings deny 永远优先；
- 三层管控不变：沙箱（硬，Landlock）→ 审批/信任（人）→ 护栏（提示词）；
  **审批放行 ≠ 沙箱豁免**。

## 4. 数据与安全

- 数据家：`~/.dsh-kiro`（用户级，`DSH_KIRO_HOME` 可覆盖）+ `<工作区>/.dsh-kiro`；
  对 `~/.kiro` / `<工作区>/.kiro` **零读取零写入零依赖**（0.7.0 起，含一次性
  只读迁移）；
- 测试安全三护栏（永久保留）：hermetic HOME/DSH_KIRO_HOME/DSH_HOME（全部指
  /tmp 沙箱）、vitest 前后指纹硬护栏（`~/.kiro` 与 `~/.dsh-kiro` 任一变动即
  整套失败）、真实家目录零接触验证；
- fail-closed 细则（openagents 借鉴）：秘密绝不进 argv（/proc 可见）；私有
  文件 0600；写不了就拒绝，不降级成暴露。

## 5. 测试战略

| 层 | 手段 | 状态 |
|---|---|---|
| 内核正确性 | vitest 424+（零 DSH 依赖） | ✅ 现有 |
| 结构契约 | 契约测试（对 DSH 协议假设的显式化） | P2 |
| 交互行为 | PTY E2E（64 用例）+ LIVE 交互审计（真实模型+真实按键） | ✅ 现有 |
| 确定性全链路 | **faux 假模型供应商**（pi 模式）：PTY 层跑全链路不依赖真实 glm——根除本轮审计暴露的限流抖动 | P2（提前，最优先） |
| 升级演练 | 破坏契约的模拟演练：改 mock 协议 → 验证优雅降级不崩 | P3 |

## 6. 实施路线（已确认方向，排期待用户批）

| 阶段 | 内容 | 产出 | 预估 |
|---|---|---|---|
| **P1 立桩** | 5 个 Port 接口定义 + 现有代码改为依赖接口（行为零变化）+ import 边界 lint | `src/dsh-adapter/` + lint + 全量回归绿 | 1-2 次会话 |
| **P2 容错** | 各 Port 防御解析 + 未知块可见化 + session 双读 + 契约测试 + **DSH 版本门禁** + **faux 供应商**（先做，解决测试稳定性） | 契约套件 + faux + 门禁 | 1-2 次会话 |
| **P3 逃生舱** | 破坏演练（mock 协议改动）+ headless-subprocess 备用适配器骨架 + 自动降级切换 | 双适配器 + 演练报告 | 1 次会话 |
| **P4 现代化**（择机） | TypeBox schema / 缓冲输出折叠 / 分段输入模型 | 体验升级 | 另批 |

**风险与回退**：P1 是纯重构（触面广、行为零变化），在 0.8.0 稳定点上推进，
git 保留已验证回退点；每阶段全量回归（vitest + PTY E2E + LIVE + 指纹）通过
才算完成。

## 7. 竞争力定位（为什么这么做）

Landlock 内核级沙箱（pi 没有）× 进程内全功能接入（第三方 DSH TUI 都没有，
它们只能 headless 子进程）× 契约测试 + 双适配器（所有人都没有）× 独立数据家
× kiro-cli 级交互 × 精细化人控审批。对标"**个人可长期持有、跨 DSH 版本
免疫的 agent 外壳**"——护城河是组合与测试纪律，不是单点功能。

---

*参考（2026-11 核查）：pi-mono 深度评测（分层/faux/TypeBox/无沙箱红旗）、
kiro-cli Rust→Ink 官方架构文（区域化 UI/缓冲输出/分段输入/保留 classic）、
openagents 的 DSH 集成笔记（headless 局限/精确版本门禁/fail-closed）、
Claude Code 架构分析（Ink 同族）。*
