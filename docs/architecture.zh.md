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
