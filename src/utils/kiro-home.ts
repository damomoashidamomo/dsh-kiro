/**
 * dsh-kiro 自己的目录根 — 解耦后唯一允许的读写落点。
 *
 * 历史背景：dsh-kiro 曾直接读写 kiro-cli 的 `~/.dsh-kiro` 与工作区 `.dsh-kiro/`，
 * 两次真实事故（测试重写真实的 trusted-tools.json、schema 字段让 kiro-cli
 * 启动报错）证明这条路走不通。现在 dsh-kiro 是独立项目：
 *
 *   用户级   `~/.dsh-kiro/`          （`DSH_KIRO_HOME` 可覆盖）
 *   工作区级 `<工作区>/.dsh-kiro/`   （跟随会话工作区）
 *
 * 规则：任何模块都不得再手写 `homedir()/.kiro` 或 `<cwd>/.kiro` —— 一律从
 * 这里取根（tests/home-guard.ts 会在整套单测前后对 ~/.dsh-kiro 做指纹，任何
 * 改动直接让测试失败）。
 *
 * @module @damomoashidamomo/dsh-kiro/utils/kiro-home
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** dsh-kiro 的用户级根目录：`~/.dsh-kiro`（`DSH_KIRO_HOME` 覆盖）。 */
export function dshKiroUserRoot(home = homedir()): string {
  const override = process.env.DSH_KIRO_HOME
  if (override !== undefined && override.trim() !== '') return override
  return join(home, '.dsh-kiro')
}

/** dsh-kiro 的工作区级根目录：`<工作区>/.dsh-kiro`。 */
export function dshKiroProjectRoot(cwd = process.cwd()): string {
  return join(cwd, '.dsh-kiro')
}
