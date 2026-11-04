/**
 * Rust engine bridge (P2): spawn `kiro-toold` per tool call — fresh process,
 * fresh Landlock restriction to the workspace root + /tmp, one JSON line in,
 * one JSON line out, hard process kill on timeout. Spawning per call (rather
 * than a long-lived daemon) is deliberate: each call gets a clean, minimal
 * kernel-level sandbox and a crash can never poison the next call.
 *
 * The binary lives at engine/target/release/kiro-toold (pnpm build:engine).
 * When absent, callers fall back to the platform tool pipeline.
 *
 * @module @damomoashidamomo/dsh-kiro/engine/bridge
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One engine tool call. */
export interface EngineCall {
  readonly tool: 'execute_bash' | 'fs_read' | 'fs_write' | 'fs_edit' | 'grep' | 'glob_tree'
  readonly args: Record<string, unknown>
}

/** Engine reply: ok carries the tool's own result object. */
export interface EngineReply {
  readonly ok: boolean
  readonly result?: Record<string, unknown>
  readonly error?: string
}

let cachedBinary: string | undefined | null = null

/**
 * Locate the engine binary (looked up once per process). Two candidates:
 * the repo layout (engine/ beside the cwd, dev + tests) and the installed
 * package layout (engine/ beside lib/). import.meta.url must go through
 * fileURLToPath — existsSync does not accept file:// URL STRINGS, which
 * silently disabled the installed-package path (the Rust engine never
 * actually ran from a deployed profile until this was fixed).
 */
export function engineBinary(): string | undefined {
  if (cachedBinary !== null) return cachedBinary ?? undefined
  const here = fileURLToPath(import.meta.url)
  const candidates = [
    join(process.cwd(), 'engine', 'target', 'release', 'kiro-toold'),
    join(here.replace(/[^/]*$/, ''), '..', '..', 'engine', 'target', 'release', 'kiro-toold'),
  ]
  cachedBinary = candidates.find((path) => existsSync(path)) ?? null
  return cachedBinary ?? undefined
}

/** Map a platform tool name + args onto the engine's tool surface. */
export function toEngineCall(name: string, args: unknown): EngineCall | undefined {
  const record = (args ?? {}) as Record<string, unknown>
  if (name === 'bash' || name === 'run_command' || name === 'execute_bash') {
    return { tool: 'execute_bash', args: record }
  }
  if (name === 'read' || name === 'read_file' || name === 'fs_read') {
    return { tool: 'fs_read', args: record }
  }
  if (name === 'write' || name === 'write_file' || name === 'fs_write') {
    return { tool: 'fs_write', args: record }
  }
  if (name === 'edit' || name === 'str_replace' || name === 'str_replace_editor' || name === 'fs_edit') {
    return { tool: 'fs_edit', args: {
      path: record['file_path'] ?? record['path'],
      old_text: record['old_string'] ?? record['old_text'] ?? record['old_str'],
      new_text: record['new_string'] ?? record['new_text'] ?? record['new_str'],
      ...(record['replace_all'] !== undefined ? { replace_all: record['replace_all'] } : {}),
    } }
  }
  if (name === 'grep' || name === 'search_file_content' || name === 'content_search') {
    return { tool: 'grep', args: {
      pattern: record['pattern'] ?? record['query'] ?? record['regex'],
      ...(record['path'] !== undefined ? { path: record['path'] } : {}),
      ...(record['max_results'] !== undefined ? { max_results: record['max_results'] } : {}),
    } }
  }
  if (name === 'glob' || name === 'list_files' || name === 'glob_tree') {
    return { tool: 'glob_tree', args: {
      pattern: record['pattern'] ?? record['glob'] ?? '*',
      ...(record['path'] !== undefined ? { path: record['path'] } : {}),
    } }
  }
  return undefined
}

/** Run one call through a freshly sandboxed engine process. */
export function runEngineCall(call: EngineCall, workspaceRoot: string, timeoutMs = 120_000): Promise<EngineReply> {
  const binary = engineBinary()
  if (binary === undefined) {
    return Promise.resolve({ ok: false, error: 'engine binary not built (pnpm build:engine)' })
  }
  return new Promise((resolve) => {
    const child = spawn(binary, ['--rw', workspaceRoot], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workspaceRoot,
    })
    let out = ''
    let settled = false
    const finish = (reply: EngineReply): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
      resolve(reply)
    }
    const timer = setTimeout(() => finish({ ok: false, error: `engine timed out after ${timeoutMs}ms` }), timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      const newline = out.indexOf('\n')
      if (newline >= 0) {
        try {
          finish(JSON.parse(out.slice(0, newline)) as EngineReply)
        } catch {
          finish({ ok: false, error: `engine reply parse failed: ${out.slice(0, newline).slice(0, 120)}` })
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (text !== '') finish({ ok: false, error: text.slice(0, 160) })
    })
    child.on('error', (error) => finish({ ok: false, error: `engine spawn failed: ${String(error)}` }))
    try {
      child.stdin.write(`${JSON.stringify({ id: 'bridge', tool: call.tool, args: call.args })}\n`)
      child.stdin.end()
    } catch (error) {
      finish({ ok: false, error: `engine write failed: ${String(error)}` })
    }
  })
}
