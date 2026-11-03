/**
 * toolsSettings matrix (P2, kiro-cli-compatible): per-tool allow/deny rules
 * evaluated BEFORE the platform tool pipeline — deny-first, anchored command
 * regex (kiro-cli semantics: patterns must match the whole command), gitignore-style
 * path globs, and autoAllowReadonly for read-only shell commands.
 *
 * File: `.kiro/tools.json`
 *   { "tools": {
 *       "bash": { "allowedCommands": ["git status"], "deniedCommands": ["rm .*"],
 *                 "autoAllowReadonly": true },
 *       "write": { "allowedPaths": ["./src/**"], "deniedPaths": ["**" + "/.env"] } } }
 *
 * Decision: 'allow' skips the approval prompt (matrix already consented),
 * 'deny' refuses without executing, 'prompt' defers to the platform approval
 * waterfall unchanged.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/tool-settings
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** One tool's rules. */
export interface ToolRule {
  readonly allowedCommands?: readonly string[]
  readonly deniedCommands?: readonly string[]
  readonly allowedPaths?: readonly string[]
  readonly deniedPaths?: readonly string[]
  readonly autoAllowReadonly?: boolean
}

export interface ToolsSettings {
  readonly tools?: Readonly<Record<string, ToolRule>>
}

/** Outcome of the matrix evaluation. */
export type SettingsVerdict = 'allow' | 'deny' | 'prompt'

const READONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'pwd', 'echo', 'wc', 'whoami', 'date', 'env',
  'which', 'file', 'stat', 'du', 'df', 'uname', 'id', 'grep', 'rg', 'find',
  'git',
])

const READONLY_GIT = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'rev-parse', 'config --get'])

/** Load `.kiro/tools.json` best-effort. */
export function loadToolsSettings(cwd: string = process.cwd()): ToolsSettings {
  try {
    const path = join(cwd, '.kiro', 'tools.json')
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf8')) as ToolsSettings
  } catch {
    return {}
  }
}

/** kiro-cli anchored regex: pattern must match the WHOLE command. */
function matchesAnchored(command: string, pattern: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`, 'u').test(command)
  } catch {
    // Invalid regex in settings: never matches (fail safe -> prompt/deny path).
    return false
  }
}

/** Gitignore-style glob: `**` crosses directories, `*` within a segment. */
function globToRegExp(glob: string): RegExp {
  const deslash = glob.replace(/^\.?\//u, '')
  // gitignore semantics: a leading **/ also matches zero directories.
  const leadingAny = deslash.startsWith('**/')
  const body = deslash.replace(/^\*\*\//u, '')
  const escaped = body.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    .replace(/\*\*/gu, '\u0000')
    .replace(/\*/gu, '[^/]*')
    .replace(/\u0000/gu, '.*')
    .replace(/\?/gu, '.')
  return new RegExp(`^${leadingAny ? '(?:.*/)?' : ''}${escaped.replace(/\/$/u, '')}$`, 'u')
}

function matchesGlob(path: string, glob: string): boolean {
  try {
    return globToRegExp(glob).test(path.replace(/^\.\/?/u, ''))
  } catch {
    return false
  }
}

function isReadonlyCommand(command: string): boolean {
  const trimmed = command.trim()
  const first = trimmed.split(/\s+/u)[0] ?? ''
  if (!READONLY_COMMANDS.has(first)) return false
  if (first !== 'git') return true
  const second = trimmed.split(/\s+/u)[1] ?? ''
  return READONLY_GIT.has(second) || READONLY_GIT.has(trimmed.split(/\s+/u).slice(1, 3).join(' '))
}

/** The command-relevant text of a tool call (bash -> command, else raw JSON). */
export function commandTextOfCall(name: string, args: unknown): string {
  if (args !== null && typeof args === 'object' && 'command' in (args as Record<string, unknown>)) {
    const command = (args as { command?: unknown }).command
    if (typeof command === 'string') return command.trim()
  }
  try {
    return JSON.stringify(args) ?? ''
  } catch {
    return String(args)
  }
}

/** The path-relevant text of a file tool call. */
export function pathTextOfCall(args: unknown): string {
  if (args === null || typeof args !== 'object') return ''
  const record = args as Record<string, unknown>
  for (const key of ['file_path', 'path', 'filePath', 'absolute_path']) {
    const value = record[key]
    if (typeof value === 'string') return value
  }
  return ''
}

/** Rule lookup tolerant of kiro-cli tool spellings (bash/execute_bash…). */
export function ruleFor(settings: ToolsSettings, toolName: string): ToolRule | undefined {
  const tools = settings.tools
  if (tools === undefined) return undefined
  const aliases: Record<string, readonly string[]> = {
    bash: ['bash', 'execute_bash', 'run_command'],
    read: ['read', 'fs_read', 'read_file'],
    write: ['write', 'fs_write', 'write_file', 'edit', 'str_replace_editor', 'apply_patch'],
  }
  for (const [canonical, names] of Object.entries(aliases)) {
    if (names.includes(toolName)) {
      for (const name of names) {
        const rule = tools[name]
        if (rule !== undefined) return rule
      }
      return tools[canonical]
    }
  }
  return tools[toolName]
}

/**
 * Evaluate the matrix for one call. Deny wins; explicit allow bypasses the
 * approval prompt; readonly auto-allow applies only to the bash family.
 */
export function verdictFor(settings: ToolsSettings, toolName: string, args: unknown): SettingsVerdict {
  const rule = ruleFor(settings, toolName)
  if (rule === undefined) return 'prompt'
  const isShell = ['bash', 'execute_bash', 'run_command'].includes(toolName)
  const isFileTool = ['write', 'fs_write', 'write_file', 'edit', 'str_replace_editor', 'apply_patch', 'read', 'fs_read', 'read_file'].includes(toolName)

  if (isShell) {
    const command = commandTextOfCall(toolName, args)
    for (const pattern of rule.deniedCommands ?? []) {
      if (matchesAnchored(command, pattern)) return 'deny'
    }
    for (const pattern of rule.allowedCommands ?? []) {
      if (matchesAnchored(command, pattern)) return 'allow'
    }
    if (rule.autoAllowReadonly === true && isReadonlyCommand(command)) return 'allow'
    return 'prompt'
  }
  if (isFileTool) {
    const path = pathTextOfCall(args)
    if (path !== '') {
      for (const glob of rule.deniedPaths ?? []) {
        if (matchesGlob(path, glob)) return 'deny'
      }
      for (const glob of rule.allowedPaths ?? []) {
        if (matchesGlob(path, glob)) return 'allow'
      }
    }
    return 'prompt'
  }
  // Other tools only support a coarse allow via allowedCommands as a name glob.
  for (const pattern of rule.allowedCommands ?? []) {
    if (matchesAnchored(toolName, pattern)) return 'allow'
  }
  return 'prompt'
}
