#!/usr/bin/env node
/**
 * Deploy the built package into a dsh profile.
 *
 * The profile depends on this repo via `file:` and pnpm materialises it as a
 * HARD-LINKED copy: `pnpm build` updates every existing file instantly (same
 * inode), but a NEWLY ADDED file has no link yet, so the profile fails with
 * `Cannot find module …/lib/ui/foo.js`. `pnpm install` refuses to re-link while
 * the version and lockfile match ("Already up to date"), and a real reinstall
 * costs minutes.
 *
 * So: link whatever is missing, then verify. Falls back to `pnpm install
 * --force` only when linking is impossible (e.g. a cross-device profile).
 *
 * Usage: node scripts/deploy-profile.mjs [profileName] [--force]
 *
 * @module @damomoashidamomo/dsh-kiro/scripts/deploy-profile
 */

import { execFileSync } from 'node:child_process'
import { linkSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const force = args.includes('--force')
const profile = args.find((arg) => !arg.startsWith('--')) ?? 'kiro'
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(home, 'profiles', profile)
const packageDir = join(profileDir, 'node_modules', '@damomoashidamomo', 'dsh-kiro')

/**
 * Files that make up the installed package: everything the package publishes
 * (`package.json#files`) plus the manifest itself. `lib` is walked; the guard
 * file and READMEs are single files.
 */
const PAYLOAD = [
  'package.json',
  'lib',
  'cordis.patch.yml',
  'README.md',
  'README.zh.md',
]

function* walk(path) {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      yield* walk(join(path, entry))
    }
    return
  }
  yield path
}

let linked = 0
let present = 0
for (const entry of PAYLOAD) {
  const source = join(repo, entry)
  for (const file of walk(source)) {
    const relative = file.slice(repo.length + 1)
    const target = join(packageDir, relative)
    try {
      statSync(target)
      present += 1
      continue
    } catch {
      // missing → link it
    }
    try {
      mkdirSync(dirname(target), { recursive: true })
      linkSync(file, target)
      linked += 1
    } catch (error) {
      console.error(`deploy-profile: could not link ${relative}: ${error.message}`)
      process.exitCode = 1
    }
  }
}

if (force || process.exitCode === 1) {
  console.log('deploy-profile: falling back to a forced install')
  execFileSync('pnpm', ['install', '--ignore-scripts', '--force'], { cwd: profileDir, stdio: 'inherit' })
}

console.log(`deploy-profile: ${profile} → ${linked} new file(s) linked, ${present} already present`)
