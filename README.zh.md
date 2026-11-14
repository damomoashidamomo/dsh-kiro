# dsh-kiro

为 [DeepSeek Harness][dsh] 提供的 **Kiro CLI 等价终端界面**(TUI)插件。
同样的 agent、同样的智能 —— 通过 Ink + React 在终端渲染:markdown、语法高亮、
状态栏、slash 命令面板、工具调用卡片、进度浮层。

墨绿色主题。面向"希望 shell 里直接用同一个 `dsh` agent 而不开 Web UI"的
单会话终端场景。

## 功能(目标:与 `kiro-cli` 平价)

| 能力 | 状态 |
| --- | --- |
| 富终端 UI(markdown + 代码高亮 + 状态栏) | ✅ 阶段 1 |
| Slash 命令注册中心(25 个命令) | ✅ 阶段 1(3 个真实实现 + 22 个 stub) |
| `.dsh-kiro/agents/` + `~/.dsh-kiro/agents/` 自定义 agent | 🟡 阶段 4 |
| `.dsh-kiro/steering/*.md` steering 文件 | 🟡 阶段 4 |
| MCP server 原生管理 | 🟡 阶段 4 |
| 子 agent 委托 + plan mode + 模型选择器 | 🟡 阶段 4 |
| 工具 trust / untrust / `--trust-all-tools` | 🟡 阶段 3 |
| Session resume / list / delete / picker | 🟡 阶段 3 |
| Checkpoint(git shadow repo) | 🟡 阶段 5 |
| 知识库(BM25 + 可选向量) | 🟡 阶段 5 |
| LSP 代码智能(TS / Py / Rust / Go / Java / Ruby / C++ / Kotlin) | 🟡 阶段 5 |
| Tangent 侧边会话 | 🟡 阶段 5 |

完整路线图见 README 末尾的 "Implementation Status"。

## 安装

```bash
# 在已有的 DSH 安装上
dsh plugin --profile kiro add github:damomoashidamomo/dsh-kiro
dsh --profile kiro
```

升级:

```bash
dsh plugin --profile kiro update
```

卸载:

```bash
dsh plugin --profile kiro remove @damomoashidamomo/dsh-kiro
```

依赖 **Node ≥ 22**(与 DeepSeek Harness 主线一致)。

## 用法

```bash
# 启动新会话
dsh --profile kiro

# 把第一条 prompt 直接写出来
dsh --profile kiro "修一下 src/foo.spec.ts 那个失败的测试"

# 恢复当前目录下最近的会话
dsh --profile kiro -r

# 交互式选会话
dsh --profile kiro --resume-picker

# 用自定义 agent(在 .dsh-kiro/agents/ 或 ~/.dsh-kiro/agents/ 下)
dsh --profile kiro --agent backend-specialist

# 非交互(CI 友好)
dsh --profile kiro --no-interactive "重构:提取 foo() 辅助函数"

# 列出模型后退出
dsh --profile kiro --list-models
```

## 架构

```
Cordis Context (kiro profile tree)
  │ session/event bus, ctx.commands, ctx.skills, ctx.approval, ctx.userQuestions
  ▼
SessionController (src/runtime/session-controller.ts)
  │ 投影 session/event → Zustand 风格的渲染状态
  ▼
Ink React App (src/ui/App.tsx)
  ├─ Transcript(用户 / 助手 / 工具消息,流式)
  ├─ ToolCard(状态机 + 输出 + 耗时)
  ├─ StatusBar(agent / model / 状态 / token 用量)
  ├─ Prompt(多行 + 历史 + @ / ! 触发)
  └─ 按需浮层:slash 菜单、模型选择器、agent 选择器…
```

`cordis.patch.yml` 重新启用 web surface 关掉的所有 base 行(TUI 单会话,
进程级 agent),并插入 12 个 kiro 插件:`kiro-startup`、`kiro-runtime`、
`kiro-commands`、`kiro-agents`、`kiro-steering`、`kiro-mcp`、`kiro-trust`、
`kiro-lsp`、`kiro-checkpoint`、`kiro-knowledge`、`kiro-tangent`。

## 快速开始（任何机器）

```bash
git clone <本仓库> && cd dsh-kiro
pnpm install && pnpm build          # 可选完整体验：pnpm build:engine（需 cargo）
node scripts/install.mjs            # 装进 ~/.dsh/profiles/kiro（--dsh-home 可改位置）
dsh --profile kiro                  # 启动
```

要求：Node ≥22、pnpm、已安装 dsh。无 Rust/cargo 也能跑（自动以 DSH 平台
管线运行，仅少 Landlock 沙箱，启动时会如实提示）；`engine-prebuilt/kiro-toold`
存在时（如发布产物）安装器自动采用。升级 = 重复运行 install.mjs；卸载 =
`node scripts/install.mjs --uninstall`。DSH 升级流程见
`docs/upgrade-runbook.zh.md`（契约测试 → 只改适配层 → 全量回归）。

## 架构方向（2026-11 定稿）

**自研内核 + 五口适配层外接 DSH**：回合循环 / Rust Landlock 工具引擎 /
审批与问答 / 全部 TUI / 自有数据家（`~/.dsh-kiro`）都是 dsh-kiro 自己的；
DSH 只通过 5 个窄接口接入（LlmPort / ToolsPort / DialogPort / SessionPort /
CommandPort，`src/dsh-adapter/`），配契约测试 + DSH 版本门禁 + headless 备用
适配器，追求**跨 DSH 版本免疫**。默认引擎 kiro/rust（`--engine dsh`、
`/loop dsh` 为逃生口）。方向全文：`docs/design/kernel-adapter.zh.md`。

## 文件布局

dsh-kiro 是**独立项目**：所有状态都读写自己的目录，与 kiro-cli 的 `~/.kiro`
**零关联**（不读、不写、不依赖）。首次启动会把曾散落在 kiro-cli 目录里的
dsh-kiro 历史数据**只读复制**过来（旧目录原封不动）。

```
~/.dsh-kiro/                    # 用户级（DSH_KIRO_HOME 可覆盖）
├── agents/                     # 自定义 agent(JSON)
├── skills/                     # 用户级技能
├── steering/                   # 用户级 steering 规则
├── hooks.json                  # 用户级 hooks
├── agent-engines.json          # 引擎绑定 / 默认 agent（dsh-kiro 私有）
└── settings/
    ├── mcp.json                # MCP server 配置
    └── trusted-tools.json      # 工具 trust 存储（dsh-kiro 自己的）

<cwd>/.dsh-kiro/                # 项目级
├── agents/                     # 项目级自定义 agent
├── steering/                   # 注入系统 prompt 的 markdown 规则
├── skills/ · skills.json       # 项目技能与开关
├── approvals.json              # 「本项目始终允许」审批持久化
├── hooks.json · tools.json     # hooks 与工具白/黑名单
├── settings/mcp.json           # 项目级 MCP server
├── loop-log.jsonl              # kiro 引擎回合 sidecar（/chat resume）
├── knowledge/ · checkpoints/   # BM25 索引 · git shadow repo
└── specs/ · paste/             # spec 模式 · 巨量粘贴落盘
```

（DSH 平台自身的会话/配置仍按平台约定放在 `~/.dsh`，与本插件无关。）

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## 许可

MIT © [damomoashidamomo](https://github.com/damomoashidamomo)

[dsh]: https://github.com/deepseek-ai/deepseek-harness
