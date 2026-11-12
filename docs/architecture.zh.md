# dsh-kiro 架构与平台对接清单

> **⚠️ 定位已升级（2026-11，v0.8 方向定稿）**：dsh-kiro 不再是"平台之上的
> TUI 壳"。现行定位：**自研内核**（回合循环 / Rust Landlock 工具引擎 / 审批
> 与问答 / 全部 TUI / 自有数据家）+ 通过**五口适配层**（LlmPort / ToolsPort /
> DialogPort / SessionPort / CommandPort）外接 DSH，追求跨 DSH 版本免疫。
> 方向全文见 `docs/design/kernel-adapter.zh.md`（北极星，冲突以其为准）。
> 下文第一部分为**现行目标架构**；"八个对接缝"及其后为**历史演进的缝清单**
> （0.1-0.6 时代记录，其中缝 ①-⑧ 将收敛为五口；路径如 `.kiro/*` 均已迁移
> 至 `.dsh-kiro/*`，见文末 2026-11 增量）。

## 现行目标架构（v0.8+）

```
┌─ dsh-kiro 内核（平台无关）──────────────────────────────┐
│ kiro-loop（默认引擎，0.8.0 起 kiro/rust + 缺二进制自动回落）│
│ Rust 引擎桥（Landlock）· 审批/提问面板 · agent/技能/       │
│ steering/hooks/trust/knowledge/checkpoint · 30 命令 · TUI │
│ 数据家 ~/.dsh-kiro + <ws>/.dsh-kiro（与 kiro-cli 零关联）  │
└───────────────┬──────────────────────────────────────────┘
                │ 只依赖 5 个 Port（src/dsh-adapter/，内核禁 import @deepseek-ai/*）
┌───────────────▼──────────────────────────────────────────┐
│ dsh-adapter：LlmPort · ToolsPort · DialogPort ·           │
│ SessionPort · CommandPort（契约测试 + DSH 版本门禁 + 容错）│
│ 双实现：in-process（主）/ headless-subprocess（降级逃生舱） │
└───────────────┬──────────────────────────────────────────┘
                ▼
        DeepSeek Harness 平台
```

跨版本兼容 = 契约测试（管协议结构）+ 行为审计（管语义漂移，PTY E2E + LIVE
长期保留）+ 版本门禁（已知不兼容版本 fail-closed）。

## 分层总览（历史基线，缝清单索引）

```
┌─────────────────────────────────────────────────────────────────────────┐
│  用户终端 (WSL / PTY)                                                    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ stdin/stdout (ink 5 + react 18)
┌──────────────────────────────▼──────────────────────────────────────────┐
│  dsh-kiro · UI 层（零平台耦合）                                           │
│  src/ui/        App · Prompt · StatusBar · PickerOverlay · Message ·     │
│                  Autocomplete · SlashMenu · ProgressOverlay · Banner (9) │
│  src/theme/     palette · banner        src/markdown/  render             │
└──────────────────────────────▲──────────────────────────────────────────┘
                               │ SessionRenderState (自研状态)
┌──────────────────────────────┴──────────────────────────────────────────┐
│  dsh-kiro · 运行时层                                                     │
│  src/runtime/   session-controller.ts (事件投影, 440 行) · index.tsx     │
│                 (Ink 启动/生命周期) · input · keybindings · types         │
│  src/commands/  30 个斜杠命令 (model/todos/knowledge/hooks/…)            │
│  src/ 特性服务   knowledge · checkpoint · steering · trust · mcp ·        │
│                 agents · tangent · lsp · startup (自研 Cordis 服务)       │
└──────┬───────────┬───────────┬───────────┬───────────┬─────────┬────────┘
       │SEAM 1     │SEAM 2     │SEAM 3     │SEAM 4     │SEAM 5   │SEAM 6/7/8
       ▼           ▼           ▼           ▼           ▼         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DeepSeek Harness 平台本体 (dsh 安装树, profile: kiro)                    │
│  cordis 框架 · dsh-agent(-loop) · dsh-tool-* (bash/fs/web/todo/subagent)  │
│  dsh-user-approval · dsh-hook-protocol/bridges · dsh-session(sqlite)     │
│  dsh-credentials · dsh-settings · 84 个已激活插件                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## 八个对接缝（SEAM）明细

| # | 缝 | 内容 | 数量 | 我方代码位置 |
|---|---|---|---|---|
| 1 | 装载契约 | `package.json dsh.bundle.patch` → `cordis.patch.yml` 插件行（startup/runtime/commands…） | 1 套 | `cordis.patch.yml` |
| 2 | 插件协议 | cordis `definePlugin` / `ctx.provide` / `ctx.inject` / `ctx.on` | 13 处 import | 全局 |
| 3 | 必需服务注入 | `cmdlineArgs` `kiroStartup` `agents` `agentDefaultModel` `sessions` `commands` | 6 个 | `src/startup.ts` `src/runtime/index.tsx` `src/commands/index.ts` |
| 4 | 可选服务获取 | `settings`(llm-pi-ai) `credentials` `loader` `appExit` | 4 个 | `serviceOf()` 包装（软降级） |
| 5 | Agent API | `followup` `inject` `whenIdle` `status` `session` `contextUsedTokens` `contextLimitTokens` `activeProvider` `activeModel` `lastTurnReason` | 10 个成员 | `src/runtime/index.tsx` |
| 6 | 会话事件流 | `session.ownEvents` 订阅；事件：`turn/start` `turn/end` `assistant/message` `assistant/chunk` `tool/call` `tool/result`；`sessions.flush` | 6 事件 + 2 方法 | `session-controller.ts` |
| 7 | Commands 服务 | `commands.register` `commands.execute` | 2 方法 | `src/commands/index.ts` |
| 8 | npm 包（devDeps） | `dsh-commands`(30) `cordis`(13) `dsh-session`(5) `dsh-agent`(3) `dsh-brand`(2) `dsh-llm`(1) `dsh-cmdline`(1) —— 类型为主 + 1 个运行时调用 `installModelSelection` | 7 包 55 import | 全局 |

**合计：8 类对接缝；运行时硬依赖 = 6 必需服务 + 10 Agent API + 6 事件 + 2 命令方法；其余全部软依赖（缺失即降级，不崩溃）。**

## 升级风险与解耦性

| 风险源 | 影响 | 现有防护 | 破坏时表现 |
|---|---|---|---|
| 事件词汇表变更（SEAM 6） | 渲染缺事件 | TurnEndReason 等为 merge-extensible，前向兼容设计 | 某类消息不显示，不崩溃 |
| 服务改名/移除（SEAM 3） | 插件起不来 | `inject` 声明式等待，缺失时 dsh 报告且插件不启动 | 启动期显式报错 |
| 可选服务缺失（SEAM 4） | 功能降级 | `serviceOf()` 统一 undefined 检查 | 命令返回 error 文本 |
| Agent API 变更（SEAM 5） | 提交/状态失效 | devDeps 精确锁版 0.1.2-rc.1，tsc 编译期拦截 | 编译失败（升级时暴露） |
| 平台大版本升级 | 多缝同时动 | 119 测试 + PTY 实测网 | 测试红灯，修复面清晰 |

### 结论（历史结论，已被 v0.8 方向修订）

> 原结论"不应该也不可能完全解耦"针对的是**当时**（壳定位）的语境。
> 2026-11 起的修订：**内核必须解耦**（自研循环/引擎/审批/数据家，0.7.0-0.8.0
> 已完成），与 DSH 的关系收敛为五口适配层 + 契约测试 + 版本门禁；"完全脱离
> DSH"仍然不做——外部能力（多模型路由、web_search 等）继续走平台。
> 详见 `docs/design/kernel-adapter.zh.md` §2。

1. **不应该也不可能"完全解耦"**（历史结论，见上方修订说明）——当时的定位是
   平台的 TUI 壳；loop/引擎/审批/数据家如今已自研，与 DSH 的耦合收敛为五口。
2. **耦合面已经收窄且集中**：全部 8 条缝集中在 `src/runtime/`、`src/commands/`（经 `serviceOf()`
   包装）与 `cordis.patch.yml`；`src/ui/`（9 组件）、theme、markdown 渲染**零平台依赖**。
3. **平台升级的现实风险可控**：rc 版本 API 可能变动，但 (a) devDeps 锁版使类型漂移在编译期暴露；
   (b) 必需服务缺失在启动期显式报错；(c) 可选服务全部软降级；(d) 119 单测 + PTY 回归网兜底。
   升级流程 = 升级 dsh → `pnpm install` 对齐 devDeps → `tsc + test` → 修 8 条缝中报错的部分。

## 待开发项的对接评估（审批 UI / Steering / Hooks）

| 项 | 平台能力 | 我方工作量 | 新增耦合 |
|---|---|---|---|
| 工具审批 UI | `dsh-user-approval` answerer 瀑布流 + `dsh-permission-presets` | Ink 审批面板 + answerer 监听 | SEAM 2 +1 监听，SEAM 4 +2 可选服务 |
| Steering | Agent 原生 `agent.steer()`（running 时下个 step 边界注入） | Prompt 提交分支接线 | SEAM 5 +1 方法 |
| Agent hooks | `dsh-hook-protocol` + claude-code/codex bridge | `/hooks` 真实化 + profile 配置装载 | SEAM 1 patch 行 + SEAM 4 +1 服务 |


---

## 2026-04 增量：新对接缝（v0.3.x 系列）

本轮（plan/审批/并行修复/像素 logo/@补全/steering/diff/todo/热重载/项目级审批）
新增与收紧的缝，按交付顺序：

### SEAM 9：user-questions 结构化问答（plan 评审等）

| 项 | 内容 |
|---|---|
| 平台侧 | `agentCtx.on('user-questions/request', answerer)` 瀑布流；取消抛 `UserQuestionError(msg,'ASK_CANCELLED')`（`@deepseek-ai/dsh-user-questions` 导出） |
| 我方 | `createQuestionAnswerer()` 逐题弹 `QuestionOverlay`；plan 评审复用同一通道（Approve=批准且 custom 为空） |
| 耦合点 | `src/runtime/question-answerer.ts`；依赖进 dependencies（profile 生产装载） |

### SEAM 10：plan / permission / todo / request-context 事件消费

controller 的 `session/event` 监听新增结构性匹配（不走类型增强，缺包不崩）：

- `plan/mode {active}` → 状态栏 `[plan]` 徽章
- `permission/preset {preset}` → `[read-only]/[write]/[full]/[custom]` 徽章
- `todo/write {todos}` → 转录内 `✻ 任务清单` 勾选快照（签名去重）
- `request/context {provider,model,contextWindow}` → 用量条分母取**平台解析的有效窗口**（与 Web UI 的 token-meter 投影同源），不再硬编码

### SEAM 11：fileReferences（@ 文件补全）

| 项 | 内容 |
|---|---|
| 平台侧 | `cordis.patch.yml` 增 `file-reference-local` 行（web-app 同款）；`ctx.get('fileReferences').list(agent,query,signal)` 遍历工作区（排除规则/缓存/工具结果失效） |
| 我方 | `fileSearch()` 防抖查询 → @ 弹窗；选中经 `formatFileMention`（`@"带空格"` 语法）插入草稿；Enter/Tab 走与弹窗一致的 Fuse 排序 |
| 附带 | 服务自动注入 FILE_REFERENCE_PROMPT 系统提示段 → 模型理解 `@path` 并主动读取 |
| 陷阱 | Cordis 服务必须 `ctx.get()`（属性直取启动崩）；类型增强须 import 服务包才进 `ctx.get` 键联合 |

### SEAM 12：steering 指导文件（自研装载器，B 方案）

- 读取 `~/.kiro/steering/*.md` + `<cwd>/.kiro/steering/*.md`（frontmatter：inclusion always/conditional/manual + include/excludeFiles glob）
- 合成一个 `kiro:steering` 系统提示段（order 650，user 级先、project 级后），32k 字符预算截断
- `/steering` 展示真实状态；`/steering reload` 原地换段文本（热重载）

### SEAM 13：审批 diff 与项目级持久化

- `ToolRecord.argsRaw` 记录 tool/call 全量参数（平台发对象 → stringify）
- 审批面板对 `edit`/`write`/`str_replace_editor` 关联最近调用记录，读**磁盘当前内容**做 LCS 行级 diff（hunk 头/3 行上下文/60 行上限；锚点失效如实报告）
- 审批第四选项"本项目始终允许" → 写 `<cwd>/.kiro/approvals.json`，下轮启动 controller 构造时种子进 session 白名单（重启免批）

### SEAM 14：hooks / steering 热重载

- hooks：`reload()` 原地换 `merged` 表；拦截 handlers **无条件注册**（初始空配置也挂线），`/hooks reload` 即时生效
- steering：段文本改为可变引用，reload 重读目录换文本，`ctx.provide` 只做一次（Cordis 禁止重复 provide）

### UI 内部修复（无新缝，记录备查）

- 并行工具 callId 关联（tool/result 按 `toolCallId` 从尾向前配对；turn/end 清扫孤儿 streaming）
- Transcript 静/活分区改为"第一条 streaming 之前"切分（Static 冻结 bug）
- reasoning 折叠单行（`✻ 已思考 · 1.2k 字`）+ streaming 关闭时机（文本/工具/turn-end）
- 工具卡只渲染结果首行；markdown 实体反转义（marked 的 `&#39;` 泄漏）
- 像素 logo：`tools/logo.py` 代码绘制 → 半块 ANSI 真彩（220×120 母版三变体，按终端宽度选优）

**更新后的依赖姿态**：运行时硬依赖新增 `@deepseek-ai/dsh-user-questions`、`@deepseek-ai/dsh-hook-protocol`、`@deepseek-ai/dsh-file-reference{,-local}`（全部 dependencies；后两者经全局树 file: 链接安装，npmjs 不通时的既定通道）。测试基线 224。


---

## 2026-10 增量：习惯驱动改善（kiro 日志分析产物）

来源：对本机 96 个 kiro-cli 会话的统计分析（`docs/kiro-habits-analysis.zh.md`，
只读副本上完成）。五项落地：

### SEAM 15：巨量粘贴保护（P2）

PTY 会把一次大粘贴拆成多个小输入事件，且多字节块中的换行曾被当作
Enter 逐行提交。现改为：块内**行尾** CR/LF 才是提交（保留"/model\r"类
快速输入语义），**夹在内容中间**的换行作为换行符入草稿；草稿累计超过
8KB（`PASTE_SPILL_THRESHOLD`）即整体落盘 `.kiro/paste/paste-<时间戳>.txt`，
草稿替换为 `[粘贴 NKB → @.kiro/paste/...]`——@ 引用与 fileReferences
补全天然衔接，模型按需 read。

### SEAM 16：上下文压力提示（P3）+ 首字延迟（P8）

用量来源改为平台 token-meter 的 **contextPressure 投影**（projectedTokens
= 已确认压力 + 表面增量估算，Web UI 同源；provider 不回传 usage 也能增长），
controller 在每个事件读取。recordUsage 的 chunk 采样保留为回退。
60%/80% 阈值各推一次系统提示（低于 50% 重新武装）。TTFT：turn/start 盖
时间戳，首个 assistant chunk（或聚合 message / 首个 tool/call，非流式
通道也能测）计算延迟，状态栏显示 `首字 X.Xs`。
**状态栏用量条图形已按用户要求移除**（阈值提醒与 /usage 保留）。

### SEAM 17：kiro 常载文件对齐（P4）

steering 装载器来源扩展：`README.md` 头 4KB（builtin 级）+
`.kiro/skills/<name>/SKILL.md` 与 `~/.kiro/skills/<name>/SKILL.md`。
注入顺序 builtin → user → project（项目级仍最具优先级）；总量仍受 32K
预算约束；`/steering` 与 `/steering reload` 自动覆盖。

### SEAM 18：内置变更护栏（P11）

`src/guardrail`（patch 行 `kiro-guardrail`，order 640，先于 steering）：
生产环境变更（服务启停/部署/集群/数据删除）或仓库外配置修改，必须先陈述
计划与影响面并等用户批准；用户明示"直接做"可豁免本轮。项目 steering 可
收紧或放宽。实测：要求重启 nginx 时模型只输出计划与确认请求，零执行。

**测试基线 232。**

---

## 2026-10 增量 2：思考档位 seam 打通（/effort 真实化 + 关键词自动升档）

### SEAM 19：reasoningEffort 全链路

六层链路：TUI 命令 → 持久化（agentDefaultModel 第三字段）→ agent-loop 请求配置 → LlmCallConfig → pi-ai 适配器（`reasoning_effort` wire 字段）→ 模型 API。此前上两层断（/effort 空壳 + settings 未声明档位），本增量接通：

- **settings 声明**：`compat.supportsReasoningEffort: true`（路由接受 `reasoning_effort`）+ 模型级 `reasoningEfforts: {low: low, high: high, max: max}`（档位→wire 值映射）+ `reasoning: low`（默认档）。适配器据此翻译并提供校验——未声明档位的模型设 effort 会显式报错（fail-loud）
- **/effort 真实化**：校验档位在模型声明范围内 → `kiroModelSwitch.apply({provider, model, reasoningEffort})`（下一轮请求即生效）+ `agentDefaultModel.saveSelection`（重启保持）。未声明的模型如实报告"不可用"
- **关键词自动升档（B 方案）**：`effort-keywords.ts` 确定性短语匹配——「深入分析/仔细推理/排查根因/架构设计/think hard」→ high，「ultrathink/极限模式/全面审查」→ max（强档优先）。手动 /effort 永远优先；模型未声明档位时静默跳过（每模型一次性提示）。档位变化在转录落可见提示行
- **/effort auto**（默认态）：清除手动固定，回到关键词模式。auto 是 TUI
  调度模式，不进 settings 的 reasoningEfforts wire 映射（协议无此值）
- **全模型声明**：settings 目录 24/24 模型已声明 reasoningEfforts
  {low,high,max}。风险提示：个别网关若拒绝 reasoning_effort 字段会导致
  该模型请求报错——删除该模型的 reasoningEfforts 声明即关闭（见 backlog）
- **多模型适配**：机制按"声明即启用"泛化——任何模型在 settings 目录声明 `reasoningEfforts` 即自动接入（关键词 + /effort）；未声明的模型不受影响。声明 wire 值时可重命名（如网关自有词汇 `max: ultra`）

**注意**：多字节粘贴块中的换行语义同批修正（行尾 CR/LF=提交，夹中间=换行入草稿），否则带换行的大粘贴会被逐行提交。

**测试基线 232+（effort 关键词/优先级/命令接线/档位校验，待运行环境恢复后执行）。**



---

## 2026-10 增量 3：粒度化信任（kiro 范围选择器对齐）

### SEAM 21：命令级/前缀级信任模式

设计原则落地（见 backlog 头部）：权限粒度越细越好、人工参与越多越好。

- 审批面板二级"信任范围"：选 本会话/本项目 后，若待批请求带 shell 命令
  （bash），弹出范围选择——整个工具 / 仅此命令（exact）/ 命令前缀（首词，
  如所有 `grep …`）。Esc 返回主选项；非 shell 工具无此步（整工具粒度）。
- 存储 v2：`.kiro/approvals.json` = `{ tools: [...], patterns: [{tool, prefix}] }`
  （v1 tools 兼容保留）；会话级 pattern 内存态。
- answerer 弹面板前先做前缀匹配（bash 取 args.command，其余取整个 args
  JSON），命中即静默放行。
- /approvals 查看器：列出三类信任（项目工具/项目模式/会话模式）+ 按序号移除。
- **分层管控语义**：审批放行 ≠ 沙箱豁免——bash 即便被信任仍在沙箱内执行，
  仓库外写入依旧被拦。变更护栏（SEAM 18）再叠一层提示词约束。三层叠加：
  沙箱（硬）→ 审批/信任（人）→ 护栏（提示词）。

**测试基线 252。**

---

## 2026-11 增量：定位升级——独立内核 + 适配层方向（0.7.0 → 0.8.0）

本轮为**架构级转向**，逐项落地了"独立外接 agent"的初衷（方向定稿全文见
`docs/design/kernel-adapter.zh.md`）：

### A. 与 kiro-cli 彻底解耦（0.7.0，破坏性）

- 数据家迁至 `~/.dsh-kiro`（`DSH_KIRO_HOME` 可覆盖）+ `<工作区>/.dsh-kiro`；
  38 个文件的手写 `~/.kiro`/`<cwd>/.kiro` 路径清零，统一走 `kiro-home.ts`；
- 一次性只读迁移（对旧目录零写入、排除 kiro-cli 的 cli.json、标记文件幂等）；
- 对 `~/.kiro` **零读取零写入零依赖**；测试三护栏：hermetic
  HOME/DSH_KIRO_HOME/DSH_HOME + vitest 前后指纹硬护栏（动即整套失败）+
  真实家目录零接触验证。

### B. 交互层修复（0.6.60-0.7.6，全部真实使用暴露）

ask_user 答案回传模型 / 多问题逐页 / 自定义输入行 / 技能目录注入系统提示 /
技能加载缺 description 崩 / 菜单 React key 撞名 / 自定义答案被吞 / 面板真实
光标定位 / swap 后状态栏标签不更新 / `/agent swap default` 回无预设。

### C. 引擎定稿（0.7.7 + 0.8.0）

- 修 `--engine kiro` 启动竞态（状态栏说谎、实际跑平台循环、审批从不弹）；
- 修 Rust 引擎写路径键（`file_path`→`path`，此前经批准的写 100% 失败）；
- 审批降噪：只读/模型辅助工具（read/grep/glob/skill/todo/think）静默放行；
- **默认引擎改为 kiro/rust**（缺二进制自动回落 + 如实提示）；`--engine dsh`
  与 `/loop dsh` 保留为逃生口。动机：双循环并存 = 行为不一致的 bug 温床。

### D. 交互审计体系（新增，长期保留）

`scripts/e2e/test_interaction_audit.py`（LIVE 门控，真实按键 + 真实模型）：
审批允许一次/拒绝+理由回执/本会话信任链、多页问答含自由输入、Esc 打断、
运行中插话回执。**语义漂移只能靠行为审计发现**——适配层防不住，此套件
与契约测试互补。

### E. 缝清单的走向

历史缝 ①-⑧（装载/插件协议/服务注入/Agent API/事件流/命令）+ ⑨-㉑ 将收敛为
五口（LlmPort 吸收 llm 流协议；ToolsPort 吸收工具注册与执行；DialogPort 吸收
user-questions/approval 瀑布；SessionPort 吸收会话事件与存储；CommandPort 吸收
命令注册）。收敛工作 = 路线 P1-P3（见 `docs/design/kernel-adapter.zh.md` §6）。

**测试基线：vitest 424 · PTY E2E 64 · LIVE 审计 6+。**
