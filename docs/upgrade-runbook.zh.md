# DSH 升级实战手册（runbook）

> 适用：DSH 平台发新版后，让 dsh-kiro 安全跟上。设计背景见
> `docs/design/kernel-adapter.zh.md` §2.3。**原则：契约测试定位破坏点 →
> 只改 `src/dsh-adapter/` → 内核零改动 → 全量回归。**

## 0. 三道防线（升级前先知道它们怎么协作）

| 防线 | 管什么 | 哪里 |
|---|---|---|
| **契约测试**（结构层） | 平台包形状漂移（导出消失/字段改名/版本混轨） | `tests/dsh-adapter.spec.ts`（35 条） |
| **容错翻译**（运行层） | llm 块词汇变化 → 降级 + anomalies 计数，不崩 | `src/dsh-adapter/in-process.ts` |
| **行为审计**（语义层） | 行为漂移（策略/时序），契约防不住的部分 | PTY E2E + faux 交互 + LIVE 套件 |

另有：**版本门禁**（已知不兼容版本 fail-closed，`DSH_KIRO_DSH_COMPAT` 覆盖）
与 **headless 自动降级**（平台 llm 不可用时回合降级为子进程通道并如实提示）。

## 1. 升级步骤（照做）

```bash
# ① 升级平台 devDeps 到新版本（package.json 里锁的 @deepseek-ai/* 版本）
pnpm install

# ② 跑契约——这是第一道也是最重要的一道
npx vitest run tests/dsh-adapter.spec.ts tests/upgrade-drill.spec.ts
```

- **全绿** → 平台兼容层无结构漂移，直接跳到第 ④ 步全量回归。
- **红灯** → 逐条看失败信息：每条契约失败都指明"哪个假设破了"。

### ③ 修适配层（内核不动）

| 契约红灯内容 | 改哪里 |
|---|---|
| 某包导出消失/改名 | `src/dsh-adapter/platform.ts`（受控再出口）+ 对应内核调用点改名 |
| llm 块词汇变化 | `src/dsh-adapter/in-process.ts` 的 `translateLlmChunk`（switch 里加新形状/改旧形状；未知块**必须保留计数**） |
| 会话格式变化 | `src/utils/sessions.ts` 的 `resolveSessionLog`（v3/v* 双读）+ 帧解析 |
| UserQuestionError / 命令形状 | `src/dsh-adapter/` 对应 Port 的翻译处 |
| 版本混轨 | 先修安装（pnpm dedupe / 重装），不是代码问题 |
| 契约本身过时（平台合理演进） | 更新契约断言 + 适配层，**同时**更新本手册第 0 节的形状清单 |

修完重跑 ② 直到绿。

### ④ 全量回归（一条都不能少）

```bash
pnpm build && node scripts/deploy-profile.mjs kiro   # 注意 refresh 计数>0 属正常
npx vitest run                                        # 468+
pnpm e2e                                              # 含 faux 交互（确定性）
KIRO_E2E_LIVE=1 python3 -m unittest discover -s scripts/e2e -p 'test_faux_interaction.py' -v
KIRO_E2E_LIVE=1 python3 -m unittest discover -s scripts/e2e -p 'test_hitl_live.py' -v
KIRO_E2E_LIVE=1 python3 -m unittest discover -s scripts/e2e -p 'test_interaction_audit.py' -v
```

### ⑤ 若新版本确认不兼容且短期修不好

1. 把版本加进 `src/dsh-adapter/version-gate.ts` 的 `KNOWN_BAD`（热修：也可用
   `DSH_KIRO_DSH_COMPAT=bad:<version>` 环境变量先挡住，不用发版）；
2. 用户侧：降级 DSH，或依赖 headless 自动降级通道应急（`scripts/headless-fallback.mjs`）。

## 2. 已演练过的破坏场景（tests/upgrade-drill.spec.ts）

- `isSkillName` 改名 → 契约红灯（导出消失形态）✅
- `UserQuestionError.code` 改名 kind → 契约红灯 ✅
- 平台包版本混轨 → 契约红灯 ✅
- llm 块 `text-delta` 改名 `delta` → 容错降级（unknown + 计数），回合不崩 ✅

## 3. 历史教训（做过的坑，别再踩）

- **部署陈旧链接**：`pnpm build` 后必须跑 `node scripts/deploy-profile.mjs kiro`，
  且确认输出里 `refreshed` 计数被正确处理（tsc 重建会打破硬链接，deploy 已按
  inode 分歧自动刷新——0.8.1 之前这里让 profile 跑过旧代码）；
- **契约只防结构**：平台改"行为"（如 0.7.7 的权限预设差异）只有行为审计能抓，
  LIVE 套件别省；
- **升级后首轮真机冒烟**：`dsh --profile kiro` 起一个会话问一句话 + 让它写个
  文件（走审批面板），确认三道防线都沉默（无告警）。
