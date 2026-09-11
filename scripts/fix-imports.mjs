/**
 * Post-build ESM import fixer for the dsh-kiro bundle.
 *
 * tsc with `moduleResolution: Bundler` emits relative import specifiers
 * verbatim (no extension rewriting), but the bundle is plain Node ESM where
 * every relative specifier must resolve to a real file:
 *
 *   - `./theme/palette`  → `./theme/palette.js`
 *   - `./runtime`        → `./runtime/index.js`   (directory index)
 *
 * Run after every `pnpm build`. Idempotent: specifiers already ending in
 * `.js` are left alone.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB = resolve(fileURLToPath(new URL('..', import.meta.url)), 'lib')

/** All emitted .js files under lib/. */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (name.endsWith('.js')) out.push(path)
  }
  return out
}

/** Rewrite one relative specifier so it points at an existing file. */
function fixSpecifier(spec, fromFile) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return spec
  if (spec.endsWith('.js')) return spec
  const base = resolve(dirname(fromFile), spec)
  const candidates = [base + '.js', join(base, 'index.js')]
  for (const candidate of candidates) {
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      let rel = relative(dirname(fromFile), candidate).split(sep).join('/')
      if (!rel.startsWith('.')) rel = './' + rel
      return rel
    }
  }
  return spec + '.js'
}

let changed = 0
for (const file of walk(LIB)) {
  const source = readFileSync(file, 'utf8')
  const rewritten = source.replace(/(\bfrom\s+|import\s*\()["']([^"']+)["']/g, (match, prefix, spec) => {
    const fixed = fixSpecifier(spec, file)
    if (fixed === spec) return match
    changed += 1
    return `${prefix}"${fixed}"`
  })
  if (rewritten !== source) writeFileSync(file, rewritten)
}

console.log(`fix-imports: rewrote ${changed} relative specifier(s) in lib/`)
