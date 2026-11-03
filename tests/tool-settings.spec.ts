/**
 * toolsSettings matrix (P2): kiro-cli-compatible allow/deny evaluation —
 * deny-first, whole-command anchored regex, path globs, autoAllowReadonly.
 */

import { describe, it, expect } from 'vitest'
import { verdictFor, type ToolsSettings } from '../src/runtime/tool-settings'

const settings: ToolsSettings = {
  tools: {
    bash: {
      allowedCommands: ['git status', 'ls .*'],
      deniedCommands: ['rm -rf .*'],
      autoAllowReadonly: true,
    },
    write: {
      allowedPaths: ['./src/**'],
      deniedPaths: ['**/*.env', '**/secrets/**'],
    },
  },
}

describe('verdictFor', () => {
  it('explicit allowedCommands match whole-command and allow', () => {
    expect(verdictFor(settings, 'bash', { command: 'git status' })).toBe('allow')
    expect(verdictFor(settings, 'bash', { command: 'ls -la /tmp' })).toBe('allow')
  })

  it('deny wins over allow (deny-first, kiro-cli semantics)', () => {
    // Even though autoAllowReadonly might cover pieces, an anchored deny hit refuses.
    const s: ToolsSettings = { tools: { bash: { allowedCommands: ['.*'], deniedCommands: ['rm .*'] } } }
    expect(verdictFor(s, 'bash', { command: 'rm -rf /' })).toBe('deny')
  })

  it('denied patterns do not partially match (anchored)', () => {
    // 'rm -rf .*' must not match a command merely CONTAINING rm.
    expect(verdictFor(settings, 'bash', { command: 'echo rm -rf' })).not.toBe('deny')
  })

  it('autoAllowReadonly auto-allows read-only commands', () => {
    expect(verdictFor(settings, 'bash', { command: 'cat note.txt' })).toBe('allow')
    expect(verdictFor(settings, 'bash', { command: 'git diff HEAD~1' })).toBe('allow')
    expect(verdictFor(settings, 'bash', { command: 'sudo reboot' })).toBe('prompt')
  })

  it('path globs allow/deny file tools with deny priority', () => {
    expect(verdictFor(settings, 'write', { file_path: './src/a.ts' })).toBe('allow')
    expect(verdictFor(settings, 'write', { file_path: './config/prod.env' })).toBe('deny')
    expect(verdictFor(settings, 'write', { file_path: 'secrets/key.pem' })).toBe('deny')
    expect(verdictFor(settings, 'write', { file_path: './docs/readme.md' })).toBe('prompt')
  })

  it('unknown tools and missing rules defer to the platform approval', () => {
    expect(verdictFor(settings, 'web_search', {})).toBe('prompt')
    expect(verdictFor({ tools: {} }, 'bash', { command: 'ls' })).toBe('prompt')
  })

  it('kiro-cli tool spellings map to the same rules', () => {
    expect(verdictFor(settings, 'execute_bash', { command: 'rm -rf /' })).toBe('deny')
    expect(verdictFor(settings, 'fs_write', { file_path: './x/.env' })).toBe('deny')
  })
})
