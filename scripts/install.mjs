#!/usr/bin/env node
/**
 * B2：dsh-kiro 通用安装器 —— 任何人、任何机器。
 *
 *   node scripts/install.mjs [--profile kiro] [--dsh-home <dir>] [--uninstall]
 *
 * 做四件事（拷贝式部署，不依赖本机硬链接/inode）：
 *  1. 在 $DSH_HOME/profiles/<name>/ 组装 profile（package.json + cordis 装配）；
 *  2. pnpm install 拉取平台包（全部来自 npm 注册表，无本机路径）；
 *  3. 拷贝 lib/ + cordis.patch.yml + patches/ + engine/（构建产物）；
 *  4. engine 二进制：cargo 可用则提示可自编译；预编译产物存在则拷贝；
 *     都没有则如实警告"将以平台管线降级运行"（TUI 仍可用）。
 *
 * 重复运行 = 升级（覆盖式）。--uninstall 移除 profile 目录。
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const profile = process.argv.includes('--profile')
  ? process.argv[process.argv.indexOf('--profile') + 1]
  : 'kiro'
const dshHome = process.argv.includes('--dsh-home')
  ? resolve(process.argv[process.argv.indexOf('--dsh-home') + 1])
  : resolve(process.env.DSH_HOME ?? join(process.env.HOME ?? '~', '.dsh'))
const profileDir = join(dshHome, 'profiles', profile)

if (process.argv.includes('--uninstall')) {
  if (!existsSync(profileDir)) {
    console.log(`install: ${profileDir} 不存在，无事可做`)
    process.exit(0)
  }
  rmSync(profileDir, { recursive: true, force: true })
  console.log(`install: 已卸载 ${profileDir}`)
  process.exit(0)
}

// 前置检查：仓库必须是构建过的（lib/ 存在）。
if (!existsSync(join(repo, 'lib'))) {
  console.error('install: 仓库尚未构建——先运行 pnpm build（engine 可选：pnpm build:engine）')
  process.exit(1)
}

// 1) profile 骨架（幂等：重跑即升级）。
mkdirSync(profileDir, { recursive: true })
const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version
// bundles 里的 @deepseek-ai/dsh-base 由 dsh 安装本体解析（profile 的
// node_modules 只装 dsh-kiro 及其注册表依赖）——不要把平台树拉进 profile。
const profilePkg = {
  name: `dsh-profile-${profile}`,
  private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@damomoashidamomo/dsh-kiro'], patchReload: 'live' } },
  dependencies: { '@damomoashidamomo/dsh-kiro': `file:${repo}` },
}
writeFileSync(join(profileDir, 'package.json'), JSON.stringify(profilePkg, null, 2) + '\n')

// 2) 平台依赖安装（注册表；--ignore-scripts 与 deploy-profile 同姿势）。
console.log('install: 拉取平台依赖（pnpm install）…')
const install = spawnSync('pnpm', ['install', '--ignore-scripts'], { cwd: profileDir, stdio: 'inherit' })
if (install.status !== 0) {
  console.error('install: pnpm install 失败——检查网络/registry 后重试')
  process.exit(1)
}

// 3) 拷贝构建产物（拷贝式：彻底摆脱硬链接的 inode 假设）。
const target = join(profileDir, 'node_modules', '@damomoashidamomo', 'dsh-kiro')
mkdirSync(target, { recursive: true })
for (const entry of ['lib', 'cordis.patch.yml', 'patches']) {
  const from = join(repo, entry)
  const to = join(target, entry)
  if (existsSync(from)) {
    rmSync(to, { recursive: true, force: true }) // 重跑=升级：先清旧拷贝
    cpSync(from, to, { recursive: true })
  }
}
writeFileSync(join(target, 'package.json'), readFileSync(join(repo, 'package.json')))
console.log(`install: 已部署 dsh-kiro ${version} → ${target}`)

// 4) engine 二进制：预编译 → cargo → 降级提示。
const engineBuilt = join(repo, 'engine', 'target', 'release', 'kiro-toold')
const enginePrebuilt = join(repo, 'engine-prebuilt', 'kiro-toold')
if (existsSync(engineBuilt) || existsSync(enginePrebuilt)) {
  const dest = join(target, 'engine', 'target', 'release')
  mkdirSync(dest, { recursive: true })
  copyFileSync(existsSync(engineBuilt) ? engineBuilt : enginePrebuilt, join(dest, 'kiro-toold'))
  console.log('install: engine 二进制已部署（Rust/Landlock 沙箱可用）')
} else {
  console.log('install: ⚠ 无 engine 二进制（未构建且无预编译）——将自动以 DSH 平台管线运行（功能可用，无 Landlock 沙箱；pnpm build:engine 可补齐）')
}

console.log(`install: 完成。启动：dsh --profile ${profile}`)
