# dsh-kiro 开箱验收清单（0.8.0）

在任意工作目录启动：`dsh --profile kiro`——**默认即自研全套（kiro 循环 + Rust 引擎）**，状态栏应显示 `[kiro/rust]`；`--engine dsh` 可显式切回平台循环

## 引擎与模式
- [ ] `/engine` → 状态页：loop/tools/rust 可用性 + 能力清单
- [ ] 启动无参数 → 状态栏直接 `[kiro/rust]`（0.8.0 默认引擎）；`/engine dsh` 再 `/engine kiro` 往返切换
- [ ] `/engine dsh` → 切回平台，徽章消失
- [ ] `/loop`、`/tools` → 细粒度覆盖仍可用
- [ ] `/agent swap <预设>`（若配置了 engine 字段）→ 引擎随预设切换

## 确认习惯（先确认后开发）
- [ ] `/spec start <feature>` → 模型起草 requirements.md → 只停在需求阶段
- [ ] `/spec approve` → 逐相推进 design → tasks → implement
- [ ] `/spec show` / `/spec revise <意见>` / `/spec abort`
- [ ] 工具审批（写/bash）：面板 1/2/3/4 + 信任范围二级选择；拒绝可填理由且理由回到模型
- [ ] `.dsh-kiro/tools.json`：allowedCommands/deniedCommands/autoAllowReadonly 生效
- [ ] 只读工具（read/grep/skill）不弹审批；写/bash 弹；「本会话始终允许」后同类不再弹
- [ ] 越界写入（rust 引擎）：工具结果显示 Permission denied，文件不存在

## Checkpoint / Undo
- [ ] `/checkpoint init` → `/checkpoint snapshot` → `/checkpoint list`
- [ ] 回合结束自动快照（list 里出现 auto: turn end）
- [ ] `/undo` → 出现确认计划 → `/undo confirm` 恢复到上一快照

## 透明与工具
- [ ] `/loop trace` → 每步可见（请求/工具/重试/压缩/插话）
- [ ] `/skills` → 菜单切换 on/off（持久化 .dsh-kiro/skills.json）；模型经 skill 工具加载技能正文无报错
- [ ] `/agent list` → 标题（当前：X）+ ◀ 当前标记；`/agent swap default` 可回无预设
- [ ] `/loop kiro` + `@文件` → 文件内容注入模型（能读出标记字样）
- [ ] 回合进行中输入文字+**回车** → 「↪ 已插话（下一步生效）」；ask_user 面板 ↓→✏️自定义输入→打字→回车，答案回到模型
- [ ] 子代理委派：让模型用 subagent 工具 → 审批面板 → 放行 → 完成

## 诊断与检索
- [ ] `/doctor` → 全 ✓（版本/服务/ink 补丁/tokenize/档位/终端/工作区）
- [ ] 搜索时效：问最新版本类问题 → 引用带「内容日期」

## 基础回归
- [ ] `/` 弹窗：↑↓ 移动 ▸、Enter 执行选中项、草稿清空
- [ ] 输入行：←/→/Home/End 移动真实光标；中文 IME 候选框锚定输入行
- [ ] 空闲无闪烁；流式输出无重影；链接 Ctrl+点击 可打开
