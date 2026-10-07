# dsh-kiro 架构与平台对接清单

> dsh-kiro 是 DeepSeek Harness (DSH) 平台之上的 **TUI 壳**：执行逻辑（agent loop、工具、
> 会话持久化、凭据）全部调用平台本体，本包只负责终端交互与渲染。

## 分层总览

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

### 结论

1. **不应该也不可能"完全解耦"** —— dsh-kiro 的定位就是平台的 TUI 壳，agent loop/todo/子代理/
   持久化是平台能力，重写等于另做一个 harness。
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
