# PTY E2E — dsh-kiro

这些用例在**伪终端里启动真实 TUI**（`dsh --profile kiro`，临时 /tmp 工作区），
对输出的**原始字节流**断言：光标定位序列、OSC 8 链接包络、空闲字节数、
擦除流量。单元测试覆盖不到这些（ink 补丁行为、终端写入路径、真彩色下的
宽度计算——displayWidth 数了 ANSI 字节那个 bug 就是在无色测试里通过的）。

## 运行

```bash
pnpm e2e
```

## 前提

- 测试对象是 **profile 里部署的构建**。改完代码先 `pnpm build` 并刷新
  profile（`pnpm remove` + `pnpm add --force file:<repo>`；**升版本号**，
  否则 pnpm 会装回旧缓存包）再跑。
- 需要 python3（标准库 only，无第三方依赖）。
- 默认套件不调用模型（会话类用例只走本地 agent 服务）；唯一会调用模型的
  `test_hitl_live.py` 默认跳过，见下文 LIVE 用例。

## 用例

| 文件 | 覆盖 |
|---|---|
| test_caret.py | 真实光标定位：空闲列、跟随输入、← 移动、中间插入、Home/End、CJK 宽度（强制 truecolor） |
| test_idle.py | 空闲 0 字节（防闪）、打字重绘受限 |
| test_session_commands.py | /` 弹窗带参匹配、/chat new、/chat resume 提示、/paste list/clean |
| test_hitl_live.py | **LIVE（默认跳过）**：技能目录真的进了 kiro-loop 系统提示、禁用技能不出现；一次 ask_user 带三个问题 → 逐页作答 → 三个答案原样回到模型 |

## LIVE 用例（真实模型调用）

`test_hitl_live.py` 需要真实模型，默认 `skip`（不拖慢/不污染默认套件），手动跑：

```bash
KIRO_E2E_LIVE=1 python3 -m unittest discover -s scripts/e2e -p 'test_hitl_live.py' -v
```

它验证"只有真跑才知道"的两件事，改 HITL / 系统提示相关代码后应重跑：

1. `/tmp` 工作区造一个探针技能（名字带随机代号），要求模型"不许调用任何工具、
   仅凭系统提示说出可用技能目录"——模型只能从系统提示里知道那个代号，答出来即
   证明目录注入生效；同时把另一个技能 `/skills <name> off` 掉，断言它不出现在
   回答里（provider 层过滤）。
2. 要求模型"一次 ask_user 调用带三个问题、选项 label 以 PIN 代号开头"：断言转录
   里只有一次 `ask_user` 调用、面板逐页出现 3 次（`数字直选` 提示出现 3 次）、
   最终模型复述的 PIN 正好是 A1/B1/C1（证明三页答案都真的回到模型）。

## 约定

- 工作区一律 `/tmp/kiro-e2e-*`（安全规则：不碰其它目录）。
- **HERMETIC HOME**：每个用例的 TUI 都有一个自己的 `/tmp/.../.home` 作为 `HOME`
  （`harness.py` 里设置）。`~/.kiro` 是 kiro-cli 自己的目录（agents/、settings/
  trusted-tools.json、agent-engines.json、skills/），用例**绝不能**往里写——
  历史事故：`test_audit_fixes.py` 曾把 `audit-broken.json` 写进真实
  `~/.kiro/agents`。要造"用户级"文件时请用 `tui.home`（如
  `os.path.join(tui.home, '.kiro', 'agents', ...)`）。`DSH_HOME` 保持真实：
  profile 里的构建从那里解析。
- harness 强制 `COLORTERM=truecolor FORCE_COLOR=3`——多项历史 bug 只在
  真彩色下暴露。
- 单元测试那侧还有一道硬护栏：`vitest` 跑前/跑后给真实 `~/.kiro` 做指纹快照，
  有任何改动就让整套单测失败（见 `tests/home-guard.ts`）。
