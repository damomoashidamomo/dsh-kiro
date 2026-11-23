/**
 * 0.9.10 — `--no-interactive` actually reaches the runtime.
 *
 * Found while verifying the release with a real model: `dsh --profile kiro
 * --no-interactive "<task>" -f plain` always failed with
 * "error: --format only applies to --no-interactive mode".
 *
 * Cause: `--no-interactive` is a NEGATABLE Commander flag, so it records
 * `interactive: false`; the mapping read `opts.noInteractive`, which Commander
 * never sets. Consequences were worse than a cosmetic flag bug:
 *   - the whole non-interactive runtime path was unreachable;
 *   - `-f/--format` could never be used;
 *   - `src/dsh-adapter/headless-llm.ts` drives its recursion-guarded fallback
 *     through exactly this command line, so that escape hatch was dead too.
 */

import { describe, it, expect } from 'vitest'
import { kiroCommand, readStartup, validate } from '../src/startup'

/** Parse argv the way the launcher hands it over (program name + args). */
function parse(argv: readonly string[]) {
  const program = kiroCommand()
  program.exitOverride()
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} })
  program.parse(['node', 'dsh', ...argv], { from: 'node' })
  // The boot action validates right after reading — mirror it here.
  const startup = readStartup(program)
  validate(startup, program)
  return startup
}

describe('CLI --no-interactive parsing (0.9.10 fix)', () => {
  it('maps --no-interactive to noInteractive:true', () => {
    const startup = parse(['--no-interactive', '列出 pod'])
    expect(startup.noInteractive).toBe(true)
    expect(startup.task).toBe('列出 pod')
  })

  it('accepts -f/--format together with --no-interactive (previously a hard error)', () => {
    const startup = parse(['--no-interactive', '列出 pod', '-f', 'json'])
    expect(startup.noInteractive).toBe(true)
    expect(startup.format).toBe('json')
  })

  it('keeps noInteractive false by default (the TUI path)', () => {
    const startup = parse([])
    expect(startup.noInteractive).toBe(false)
    expect(startup.format).toBeUndefined()
  })

  it('rejects --format without --no-interactive', () => {
    expect(() => parse(['-f', 'plain'])).toThrow(/--format only applies to --no-interactive/u)
  })

  it('rejects --no-interactive with no task', () => {
    expect(() => parse(['--no-interactive'])).toThrow(/requires a positional task/u)
  })

  it('joins a multi-word positional task and keeps the other flags intact', () => {
    const startup = parse(['--no-interactive', '查看', 'helm', 'values', '--cwd', '/tmp/x', '--model', 'ark-code-latest'])
    expect(startup.task).toBe('查看 helm values')
    expect(startup.workspaceDir).toBe('/tmp/x')
    expect(startup.model).toBe('ark-code-latest')
    expect(startup.noInteractive).toBe(true)
  })
})
