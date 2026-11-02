/**
 * Trust store (T-1 split from session-controller): the persistence and
 * matching layer behind the approval panel's finer-grained scopes —
 * project-level whole-tool allowances plus command-prefix patterns in
 * `.kiro/approvals.json` (v2; v1 files contribute their tools array).
 *
 * Pure module: no controller state, fully unit-testable.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/trust-store
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Path of the project-level approval store inside the workspace. */
function projectApprovalsPath(): string {
  return join(process.cwd(), '.kiro', 'approvals.json')
}

/** One finer-grained trust entry: commands of `tool` starting with `prefix`. */
export interface ApprovalPattern {
  readonly tool: string
  readonly prefix: string
}

/** Read persisted approvals (v2 patterns + v1 tools; missing file -> none). */
export function loadProjectApprovals(): string[] {
  return loadProjectApprovalStore().tools
}

export function loadProjectPatterns(): ApprovalPattern[] {
  return loadProjectApprovalStore().patterns
}

function loadProjectApprovalStore(): { tools: string[]; patterns: ApprovalPattern[] } {
  try {
    const raw = readFileSync(projectApprovalsPath(), 'utf8')
    const parsed = JSON.parse(raw) as { tools?: unknown; patterns?: unknown }
    const tools = Array.isArray(parsed.tools)
      ? parsed.tools.filter((t): t is string => typeof t === 'string' && t !== '')
      : []
    const patterns = Array.isArray(parsed.patterns)
      ? parsed.patterns.filter((p): p is ApprovalPattern => {
          return typeof p === 'object' && p !== null
            && typeof (p as { tool?: unknown }).tool === 'string'
            && typeof (p as { prefix?: unknown }).prefix === 'string'
        })
      : []
    return { tools, patterns }
  } catch {
    return { tools: [], patterns: [] }
  }
}

/** Persist approvals (best effort): tools + command-prefix patterns. */
export function saveProjectApprovals(tools: readonly string[], patterns: readonly ApprovalPattern[] = []): void {
  try {
    mkdirSync(join(process.cwd(), '.kiro'), { recursive: true })
    const payload = { tools: [...tools].sort(), patterns: [...patterns] }
    writeFileSync(projectApprovalsPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch {
    // Unwritable workspace: the allowance still holds for this session.
  }
}

/**
 * The command-relevant string of a pending request: bash -> `command`,
 * everything else -> the full argument JSON (prefix trust on non-shell
 * tools compares the whole payload).
 */
export function commandTextOf(toolName: string, argsJson: string | undefined): string | undefined {
  if (argsJson === undefined) return undefined
  try {
    const args = JSON.parse(argsJson) as { command?: unknown }
    if (toolName === 'bash' && typeof args.command === 'string') return args.command.trim()
  } catch {
    // fall through to raw JSON
  }
  return argsJson.trim()
}

/** Whether a (tool, args) pair matches any persisted prefix pattern. */
export function matchesTrustPattern(patterns: readonly { tool: string; prefix: string }[], toolName: string, args: string | undefined): boolean {
  const command = args !== undefined ? args : undefined
  if (command === undefined) return false
  return patterns.some((p) => p.tool === toolName && command.startsWith(p.prefix))
}
