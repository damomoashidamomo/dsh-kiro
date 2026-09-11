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
| `.kiro/agents/` + `~/.kiro/agents/` 自定义 agent | 🟡 阶段 4 |
| `.kiro/steering/*.md` steering 文件 | 🟡 阶段 4 |
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

# 用自定义 agent(在 .kiro/agents/ 或 ~/.kiro/agents/ 下)
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

## 文件布局

```
~/.kiro/
├── agents/                       # 自定义 agent(JSON)
├── settings/
│   ├── mcp.json                  # MCP server 配置
│   ├── trusted-tools.json        # 工具 trust 存储
│   └── settings.json             # chat 默认值
├── cli-todo-lists/               # TODO 列表持久化
└── history/                      # prompt 历史

<cwd>/.kiro/
├── agents/                       # 项目级自定义 agent
├── steering/                     # 注入系统 prompt 的 markdown 规则
├── settings/mcp.json             # 项目级 MCP server
├── knowledge/                    # BM25 索引
├── checkpoints/                  # git shadow repo
└── sessions/                     # session 存储覆盖
```

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
