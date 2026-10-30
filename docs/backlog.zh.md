# dsh-kiro 待办台账（deferred backlog）

> 约定：这里积累"确认过要做但排期靠后"和"评估过暂不做"的项。你需要时说一声，
> 我从这里挑出来给你确认再动工。完成或明确放弃的会移到文末归档。
>
> **设计原则（用户钦定，永续有效）**：dsh-kiro 的开发目的 = 与 kiro-cli 同级
> 甚至更可控。权限控制越精细越好，人工参与越多越好——不让 agent 放飞自我
> 做错事情。所有新功能评审时对照此原则。

## 待开发（已确认方向，待排期）

| # | 项 | 备注 |
|---|---|---|
| B-1 | MCP 面板 | /mcp 命令存在，overlay 占位；服务器状态/启停 UI |
| B-2 | Checkpoint 面板 | /checkpoint 命令存在，overlay 占位；**依据使用数据你不用 checkpoint，优先级最低** |
| B-3 | Agent picker / 会话切换器 | /agent /chat 命令存在，picker 占位 |
| B-4 | Knowledge / Editor 面板 | overlay 占位 |
| B-5 | 图像生成插件修复 | settings 里 `Qwen-Image-2.0` 是无效模型名（正确为 `Qwen-Image-2512`），且插件发的 OpenAI 格式与网关要求的 `input.prompt` schema 不符——后者是 harness 侧代码，本仓库修不了 |
| B-6 | scnet DeepSeek/V4 系思考档位声明 | 若 scnet 网关确认转发 `reasoning_effort`，给 V4 系模型加 reasoningEfforts 声明即可接入 /effort 与关键词升档（同 glm 做法） |
| B-9 | 模型抖动反馈优化 | `Request timed out` 时给出重试/退避提示，而非静默失败文本 |
| B-10 | logo 眨眼动画 | 纯装饰 |

## 工程债（评估报告遗留，见评估对话）

| # | 项 | 备注 |
|---|---|---|
| T-1 | 拆分 session-controller（879 行上帝对象） | 投影/交互状态机/策略存储三块 |
| T-2 | PTY E2E 入仓 | scripts/e2e/*.py + pnpm e2e，可 CI 化 |
| T-3 | 依赖可移植性 | 两个 file: 依赖指向本机全局树，clone 后无法构建 |
| T-4 | UI 文案目录化 | 62 处硬编码中文与英文混排 |
| T-5 | CI 工作流 | typecheck + test + build |
| T-6 | /doctor 诊断命令 | 平台版本/缝健康度/装载状态 |
| T-7 | 占位 overlay 清理 | 未实现的 overlay kind 从类型与 /help 移除或实现 |
| T-8 | Prompt 输入逻辑归并 runtime/input.ts | 折叠/粘贴/前缀逻辑部分在组件内 |

## 归档（已完成或放弃）

- ✅ @文件补全 / steering 注入 / 审批 diff / todo 清单 / 热重载 / 审批项目级持久化（0.3.x）
- ✅ 习惯驱动五项：粘贴落盘 / 上下文提醒 / README+skills 常载 / 首字延迟 / 变更护栏（0.4.x）
- ✅ /effort 真实化 + 关键词自动升档（B 方案，glm 先行，其他模型按声明接入）
- ✅ 粒度化信任（B-11）：审批面板二级"信任范围"（整个工具/仅此命令/命令前缀），
      patterns 落盘 .kiro/approvals.json v2，匹配自动放行；审批≠沙箱豁免（分层管控）
- ✅ /approvals 查看器（B-8）：列出/移除 项目工具信任 + 项目/会话模式信任
- ✅ /paste list|clean（B-7）：列出/清理 `.kiro/paste/` 落盘粘贴文件（只删
      paste-*.txt，目录空则一并删除）
- ⏸ checkpoint / 子代理 UI——**数据驱动放弃**（96 会话 0/2 次使用）
- ⏸ P1 bash 自动放开——安全降级，不做（B2 的项目级持久化已覆盖需求）
