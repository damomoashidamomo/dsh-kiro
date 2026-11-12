/**
 * DSH 版本门禁（P2.5，openagents 模式）。
 *
 * 原则：**已知不兼容 → fail-closed**（阻塞新回合并如实说明），未知版本 →
 * 放行但把版本号写进可诊断处。已知不兼容清单：
 *  1. 内置 KNOWN_BAD（默认空——出现破坏性版本时加一条即可热修）；
 *  2. 环境变量 DSH_KIRO_DSH_COMPAT 覆盖，格式 `bad:1.2.3,1.2.4;min:0.9.0`
 *     （升级演练/应急用，不用发版）。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/version-gate
 */

import { createRequire } from 'node:module'

/** 门禁判定结果。 */
export interface GateVerdict {
  readonly ok: boolean
  readonly version: string | undefined
  readonly reason: string | undefined
}

/** 内置已知不兼容版本（精确匹配）。出现破坏性平台版本时在此追加。 */
const KNOWN_BAD: readonly string[] = []

/** 最低兼容版本（语义化前缀比较；undefined = 不设下限）。 */
const KNIMUM: string | undefined = undefined

/** 解析 `bad:1.2.3,1.2.4;min:0.9.0` 形式的覆盖配置。 */
export function parseCompatOverride(raw: string | undefined): { bad: readonly string[]; min: string | undefined } {
  if (raw === undefined || raw.trim() === '') return { bad: KNOWN_BAD, min: KNIMUM }
  let bad = [...KNOWN_BAD]
  let min: string | undefined = KNIMUM
  for (const part of raw.split(';')) {
    const [key, value] = part.split(':')
    if (key === 'bad') bad = value.split(',').map((v) => v.trim()).filter((v) => v !== '')
    if (key === 'min') min = value.trim()
  }
  return { bad, min }
}

/** 探测当前运行时的平台版本（读 profile 内实际装载的 cordis 包版本）。 */
export function detectPlatformVersion(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const path = require.resolve('@deepseek-ai/cordis/package.json')
    const pkg = require(path) as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

/** 语义化前缀比较：a < b → -1（只比数字段， prerelease 视为更低）。 */
export function compareVersions(a: string, b: string): number {
  const clean = (v: string) => v.replace(/^v/u, '')
  const parse = (v: string) => clean(v).split(/[.-]/u).map((seg) => Number.parseInt(seg, 10))
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

/**
 * 评估门禁。version 检测不到时：放行但 reason 标注"无法检测"（不因探测
 * 失败阻塞——那会让门禁本身变成新的单点故障）。
 */
export function evaluateGate(
  version: string | undefined,
  override: string | undefined = process.env.DSH_KIRO_DSH_COMPAT,
): GateVerdict {
  if (version === undefined) {
    return { ok: true, version: undefined, reason: '平台版本无法检测（已放行，仅记录）' }
  }
  const { bad, min } = parseCompatOverride(override)
  if (bad.includes(version)) {
    return { ok: false, version, reason: `DSH ${version} 在本构建的已知不兼容清单中（DSH_KIRO_DSH_COMPAT 可覆盖）` }
  }
  if (min !== undefined && compareVersions(version, min) < 0) {
    return { ok: false, version, reason: `DSH ${version} 低于最低兼容版本 ${min}` }
  }
  return { ok: true, version, reason: undefined }
}
