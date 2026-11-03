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
| B-2 | Checkpoint 面板 | /checkpoint 命令存在，overlay 占位；**依据使用数据你不用 checkpoint，优先级最低** |
| B-5 | 图像生成插件修复 | settings 里 `Qwen-Image-2.0` 是无效模型名（正确为 `Qwen-Image-2512`），且插件发的 OpenAI 格式与网关要求的 `input.prompt` schema 不符——后者是 harness 侧代码，本仓库修不了 |

## 工程债（评估报告遗留，见评估对话）

| # | 项 | 备注 |
|---|---|---|
| T-3 | 依赖可移植性 | 两个 file: 依赖指向本机全局树，clone 后无法构建 |

## 归档（已完成或放弃）

- ✅ @文件补全 / steering 注入 / 审批 diff / todo 清单 / 热重载 / 审批项目级持久化（0.3.x）
- ✅ 习惯驱动五项：粘贴落盘 / 上下文提醒 / README+skills 常载 / 首字延迟 / 变更护栏（0.4.x）
- ✅ /effort 真实化 + 关键词自动升档（B 方案，glm 先行，其他模型按声明接入）
- ✅ 粒度化信任（B-11）：审批面板二级"信任范围"（整个工具/仅此命令/命令前缀），
      patterns 落盘 .kiro/approvals.json v2，匹配自动放行；审批≠沙箱豁免（分层管控）
- ✅ /approvals 查看器（B-8）：列出/移除 项目工具信任 + 项目/会话模式信任
- ✅ /paste list|clean（B-7）：列出/清理 `.kiro/paste/` 落盘粘贴文件（只删
      paste-*.txt，目录空则一并删除）
- ✅ 模型抖动反馈（B-9）：回合失败按 超时/限流/5xx/鉴权/网络/模型 分类，
      给出 /retry 重发、等待退避、/model 切换等具体建议；新增 /retry 命令
- ✅ PTY E2E 入仓（T-2）：scripts/e2e/（harness + 13 用例）+ pnpm e2e；
      强制 truecolor（历史 bug 只在真彩暴露）；不调模型，全程 /tmp
- ✅ 思考档位通用策略（B-6，升级为全模型方案）：档位阶梯解析
      模型声明 > Provider 默认 > 名称推断（标注来源）；/effort probe 实测
      网关是否转发 reasoning_effort；档位字段被拒归类为新失败类并给建议
- ✅ /doctor 诊断（T-6）：版本/服务装载/ink 补丁与 tokenize 版本自检/
      当前模型窗口与档位来源/终端能力/工作区 .kiro 状态，一键输出
- ✅ 恢复会话上下文估算（N-1）：回放后状态栏显示「约 N%」，真实投影
      到达后自动替换为准确值
- ✅ 占位清理（T-7）：/code /tangent /prompts 描述明确标注「未实现」
- ✅ MCP 面板（B-1）：/mcp 输出 manager 状态表（configured/starting/
      ok/error + 工具清单）与首个服务器配置指引；启停待 phase 5 连接器
- ✅ 拆分 session-controller（T-1）：trust-store（策略存储）/ event-helpers
      （投影纯函数）/ streaming-settle（沉降边界）三个模块拆出；交互状态机
      因与 publish/unbind 耦合留在控制器（1264→~1130 行）
- ✅ Knowledge 浏览（B-4a）：/knowledge view <ref> 渲染源文件前 80 行
- ✅ CI（T-5）：.github/workflows/ci.yml——install（补丁/override 生效）
      + test + build，PTY E2E 在有 dsh 的 runner 上自动跑
- ✅ /agent swap（B-3 诚实子集）：应用预设声明的模型/档位；人格级隔离
      待平台支持（swap 输出会提示）
- ✅ logo 眨眼（B-10）：启动时 tagline 分隔符在 live 区闪 4 次后冻结 Static
- ✅ Prompt 输入归并（T-8）：多字节折叠 foldInputChunk 抽入 runtime/input
- ✅ UI 文案目录（T-4 最小集）：ui/strings.ts 收口常驻界面文案
- ⏸ Editor 面板化（B-4b）——**用户确认不做**：外部 $EDITOR + 8KB 粘贴
      落盘已覆盖长提示场景
- ✅ Skill 平台联动 + 选择性加载（用户需求）：dsh-base 的 skill 子系统
      （registry + filesystem + tool-skill 模型工具）+ kiro-skills provider
      （.kiro/skills 根 + .kiro/skills.json 选择）；/skills 列表与 on|off，
      停用项对模型目录完全不可见
- ✅ 自建 agent loop P1：kiro-loop 驱动器（纯对话）+ /loop dsh|kiro 切换，
      合成平台事件形状→同一转录/审批 UI；PT 实测对话与双向切换通过
- ✅ 自建 agent loop P2（Node 侧）：完整工具循环（tool-call 解析 →
      toolsSettings 预检 → ctx.tools 执行 → 结果回填续跑）、退避重试 +
      停滞流保护、上下文自动压缩；实测模型调 read 工具并原样返回文件内容
- ✅ Rust 工具引擎（P2 完成）：engine/kiro-toold（execute_bash + fs_read +
      fs_write），进程启动即 Landlock 自限（只许写工作区+/tmp，全盘只读），
      每次调用新进程；/tools rust|dsh 切换；实测内核级拒绝越界写入、
      模型经引擎完成 bash 工具往返
- ✅ P3 扩展（kiro-loop 内）：并行工具分发（只读工具重叠执行，上限 4，
      写操作强制串行）；kiro_todo_write / kiro_think 工具注册进平台工具表
      （两种 loop 均可用，转录实时渲染清单与思考摘要）；子代理委派经
      P2 工具缝直接可用（平台 subagent 工具已在注册表）
- ⏸ checkpoint / 子代理 UI——**数据驱动放弃**（96 会话 0/2 次使用）
- ⏸ P1 bash 自动放开——安全降级，不做（B2 的项目级持久化已覆盖需求）
