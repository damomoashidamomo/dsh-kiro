import { describe, it, expect } from 'vitest'
import { runShell, parseShellCommand } from '../src/utils/shell'

describe('parseShellCommand', () => {
  it('detects a leading ! and strips it', () => {
    expect(parseShellCommand('!ls -la')).toBe('ls -la')
    expect(parseShellCommand('!pwd')).toBe('pwd')
  })
  it('returns undefined when not a shell escape', () => {
    expect(parseShellCommand('ls -la')).toBeUndefined()
    expect(parseShellCommand('hello')).toBeUndefined()
  })
  it('returns undefined for a bare !', () => {
    expect(parseShellCommand('!')).toBeUndefined()
  })
  it('trims whitespace after the !', () => {
    expect(parseShellCommand('!   echo hi   ')).toBe('echo hi')
  })
})

describe('runShell', () => {
  it('captures stdout and exit code 0', async () => {
    if (process.platform === 'win32') return // skip on Windows
    const result = await runShell('echo hello')
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('hello')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
  it('captures non-zero exit codes', async () => {
    if (process.platform === 'win32') return
    const result = await runShell('exit 7')
    expect(result.exitCode).toBe(7)
  })
  it('honors maxBytes truncation', async () => {
    if (process.platform === 'win32') return
    const result = await runShell('yes', process.cwd(), undefined, 128)
    expect(result.truncated).toBe(true)
  })
})
