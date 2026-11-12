#!/usr/bin/env node
/**
 * P3.2 headless 备用舱（降级逃生舱骨架，openagents 模式）。
 *
 * 用途：当 DSH 大版本破坏了 dsh-kiro 的**进程内**适配器（契约测试红灯、
 * /doctor 报适配器不健康）时，在修好适配器之前用这个脚本保持基本可用——
 * 它以子进程方式驱动 dsh（不依赖进程内 cordis 装配），任务经 0600 私有
 * 文件传入（绝不让任务文本进 argv：/proc 可见）。
 *
 * 用法：node scripts/headless-fallback.mjs "任务文本" [--profile kiro]
 *
 * 已知局限（与进程内模式相比，如实声明）：无流式（只有最终输出）、无审批
 * 面板交互（生产工具会被平台策略约束）、无会话恢复。它是应急通道，不是
 * 常规使用方式。
 */

import { writeFileSync, unlinkSync, chmodSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const profileFlag = argv.findIndex((a) => a === '--profile')
const profile = profileFlag >= 0 ? argv[profileFlag + 1] : 'kiro'
if (profileFlag >= 0) argv.splice(profileFlag, 2)
const task = argv.join(' ').trim()
if (task === '') {
  console.error('usage: node scripts/headless-fallback.mjs "任务文本" [--profile kiro]')
  process.exit(1)
}

// 0600 私有任务文件：fail-closed——写不了就拒绝（不降级到 argv 泄漏）。
const dir = mkdtempSync(join(tmpdir(), 'dsh-kiro-headless-'))
const taskFile = join(dir, 'task.txt')
try {
  writeFileSync(taskFile, task, { mode: 0o600 })
  chmodSync(taskFile, 0o600)
} catch (error) {
  console.error(`headless-fallback: 任务文件写入失败（fail-closed）：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
try {
  // 固定句子进 argv（任务本体在文件里）；--no-interactive 走无 UI 通道。
  const result = spawnSync('dsh', [
    '--profile', profile,
    '--no-interactive',
    `请完成私有任务文件 ${taskFile} 中描述的任务。`,
  ], { stdio: 'inherit', cwd: repoRoot, env: process.env })
  process.exit(result.status ?? 1)
} finally {
  try { unlinkSync(taskFile) } catch { /* 已清理 */ }
}
