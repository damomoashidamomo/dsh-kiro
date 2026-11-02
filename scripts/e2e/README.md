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
- 全部用例不调用模型；会话类用例只走本地 agent 服务。

## 用例

| 文件 | 覆盖 |
|---|---|
| test_caret.py | 真实光标定位：空闲列、跟随输入、← 移动、中间插入、Home/End、CJK 宽度（强制 truecolor） |
| test_idle.py | 空闲 0 字节（防闪）、打字重绘受限 |
| test_session_commands.py | /` 弹窗带参匹配、/chat new、/chat resume 提示、/paste list/clean |

## 约定

- 工作区一律 `/tmp/kiro-e2e-*`（安全规则：不碰其它目录）。
- harness 强制 `COLORTERM=truecolor FORCE_COLOR=3`——多项历史 bug 只在
  真彩色下暴露。
