/**
 * dsh-kiro shell escape (`!cmd`) — run a host shell command and stream the
 * combined stdout/stderr into a system message in the transcript.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/shell
 */

import { spawn } from 'node:child_process'

/** Result of one shell execution. */
export interface ShellResult {
  /** Combined stdout + stderr text. */
  readonly output: string
  /** Process exit code (or null when killed by signal). */
  readonly exitCode: number | null
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number
  /** Whether the command was truncated at the byte cap. */
  readonly truncated: boolean
}

/** Maximum bytes captured from a shell command's combined output. */
const DEFAULT_MAX_BYTES = 64 * 1024

/**
 * Run one shell command line. We spawn a shell with `-c` and stream the output
 * up to `maxBytes`; once the cap is hit, we kill the child to avoid runaway
 * commands filling the transcript.
 * @param command - the exact command line as the user typed it (no leading `!`).
 * @param cwd - working directory; defaults to `process.cwd()`.
 * @param shell - shell executable; defaults to `bash` (Windows falls back to `cmd.exe`).
 * @param maxBytes - byte cap; default 64 KiB.
 * @returns the captured result.
 */
export async function runShell(
  command: string,
  cwd: string = process.cwd(),
  shell?: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<ShellResult> {
  const executable = shell ?? (process.platform === 'win32' ? 'cmd.exe' : 'bash')
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command]
  const startedAt = Date.now()
  return new Promise<ShellResult>((resolve) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let truncated = false
    const append = (chunk: Buffer): void => {
      if (truncated) return
      const text = chunk.toString('utf8')
      const combined = output + text
      if (Buffer.byteLength(combined, 'utf8') > maxBytes) {
        truncated = true
        const allowedBytes = Math.max(0, maxBytes - Buffer.byteLength(output, 'utf8'))
        output += combined.slice(0, allowedBytes)
        output += '\n…[output truncated]'
        child.kill('SIGTERM')
      } else {
        output = combined
      }
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('close', (code) => {
      resolve({
        output: output.trimEnd(),
        exitCode: code,
        durationMs: Date.now() - startedAt,
        truncated,
      })
    })
    child.on('error', (error) => {
      resolve({
        output: `${output}\n[spawn error: ${error.message}]`.trim(),
        exitCode: null,
        durationMs: Date.now() - startedAt,
        truncated,
      })
    })
  })
}

/**
 * Parse a leading `!` prefix from a user draft and return the command text.
 * Returns `undefined` when the draft is not a shell escape.
 * @param text - the raw draft text from the prompt.
 * @returns the command text without the leading `!`, or undefined.
 */
export function parseShellCommand(text: string): string | undefined {
  if (!text.startsWith('!')) return undefined
  if (text === '!') return undefined
  return text.slice(1).trim()
}
