# dsh-kiro 开箱验收清单（0.6.13）

在任意工作目录启动：`dsh --profile kiro`（自研全套：`--engine kiro`）

## 引擎与模式
- [ ] `/engine` → 状态页：loop/tools/rust 可用性 + 能力清单
- [ ] `/engine kiro` → 一键切换，状态栏出现 `[kiro/rust]` 徽章
- [ ] `/engine dsh` → 切回平台，徽章消失
- [ ] `/loop`、`/tools` → 细粒度覆盖仍可用
- [ ] `/agent swap <预设>`（若配置了 engine 字段）→ 引擎随预设切换

## 确认习惯（先确认后开发）
- [ ] `/spec start <feature>` → 模型起草 requirements.md → 只停在需求阶段
- [ ] `/spec approve` → 逐相推进 design → tasks → implement
- [ ] `/spec show` / `/spec revise <意见>` / `/spec abort`
- [ ] 工具审批：任何 prompt 级工具执行前弹面板（1/2/3/4 + 信任范围二级选择）
- [ ] `.kiro/tools.json`：allowedCommands/deniedCommands/autoAllowReadonly 生效
- [ ] 越界写入（rust 引擎）：工具结果显示 Permission denied，文件不存在

## Checkpoint / Undo
- [ ] `/checkpoint init` → `/checkpoint snapshot` → `/checkpoint list`
- [ ] 回合结束自动快照（list 里出现 auto: turn end）
- [ ] `/undo` → 出现确认计划 → `/undo confirm` 恢复到上一快照

## 透明与工具
- [ ] `/loop trace` → 每步可见（请求/工具/重试/压缩/插话）
- [ ] `/skills` → 列表 + on/off 切换（web-search-recency 应为 ◉）
- [ ] `/loop kiro` + `@文件` → 文件内容注入模型（能读出标记字样）
- [ ] 回合进行中提交 → 「已插话（下一步生效）」
- [ ] 子代理委派：让模型用 subagent 工具 → 审批面板 → 放行 → 完成

## 诊断与检索
- [ ] `/doctor` → 全 ✓（版本/服务/ink 补丁/tokenize/档位/终端/工作区）
- [ ] 搜索时效：问最新版本类问题 → 引用带「内容日期」

## 基础回归
- [ ] `/` 弹窗：↑↓ 移动 ▸、Enter 执行选中项、草稿清空
- [ ] 输入行：←/→/Home/End 移动真实光标；中文 IME 候选框锚定输入行
- [ ] 空闲无闪烁；流式输出无重影；链接 Ctrl+点击 可打开
