#!/usr/bin/env node
/**
 * P1.3 边界 lint：内核目录禁止**运行时** import `@deepseek-ai/dsh-*`（适配层
 * src/dsh-adapter/ 除外）。type-only import 允许（类型耦合即契约，由 devDeps
 * 锁版 + 契约测试管理）。@deepseek-ai/cordis 是插件框架本身（SEAM 1/2），
 * 不在禁止之列。
 *
 * 违例清单模式：--ratchet 写入当前清单，后续运行不得新增（存量逐步清零）。
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { basename } from 'node:path'

const RATCHET_FILE = new URL('../.adapter-boundary-ratchet.json', import.meta.url)
const ADAPTER_DIR = 'src/dsh-adapter/'
const FORBIDDEN = /from\s+['"]@deepseek-ai\/dsh-[a-z-]+['"]/g

let files = []
try {
  files = execSync("git ls-files 'src/*.ts' 'src/*.tsx'", { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
} catch {
  console.error('boundary: git ls-files 失败（需在仓库内运行）')
  process.exit(1)
}

const violations = []
for (const file of files) {
  if (file.startsWith(ADAPTER_DIR)) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (!FORBIDDEN.test(line)) { FORBIDDEN.lastIndex = 0; return }
    FORBIDDEN.lastIndex = 0
    // type-only imports are the pinned contract surface — allowed.
    const isTypeOnly = /^\s*import\s+type\s/.test(line) || /^\s*export\s+type\s/.test(line) || /^\s*import\s+type\s*\{/.test(line)
    if (!isTypeOnly) violations.push(`${file}:${i + 1}:${line.trim()}`)
  })
}

const current = [...violations]
if (process.argv.includes('--ratchet')) {
  writeFileSync(RATCHET_FILE, JSON.stringify(current, null, 2) + '\n')
  console.log(`boundary: ratchet 写入 ${current.length} 条存量违例`)
  process.exit(0)
}

const baseline = existsSync(RATCHET_FILE)
  ? JSON.parse(readFileSync(RATCHET_FILE, 'utf8'))
  : []
const baseSet = new Set(baseline)
const fresh = current.filter((v) => !baseSet.has(v))
if (fresh.length > 0) {
  console.error(`boundary: 内核出现 ${fresh.length} 条新的运行时 @deepseek-ai/dsh-* import（存量 ${current.length - fresh.length} 条待清）：`)
  for (const v of fresh) console.error(`  + ${v}`)
  console.error('内核只允许 import src/dsh-adapter（见 docs/design/kernel-adapter.zh.md §2.1）。')
  process.exit(1)
}
console.log(`boundary: OK（存量违例 ${current.length}/${baseline.length}，无新增）`)
