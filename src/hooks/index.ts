/**
 * Kiro hooks loader — the B-option self-owned `.kiro/hooks.json` engine.
 *
 * Reads Claude-Code-compatible command hooks from (in run order per event):
 *   1. `~/.kiro/hooks.json`  — user level
 *   2. `<workspace>/.kiro/hooks.json` — project level (session cwd)
 *
 * and wires them onto the harness interception extension points using the
 * platform's `dsh-hook-protocol` (matching, execution via ctx.shell, decision
 * folding, durable `hook/invoked`/`hook/result` audit). The payload dialect
 * stays Claude-Code-shaped so existing hook scripts run unmodified.
 *
 * Supported points (kiro parity):
 *   SessionStart → agent/session-start   (detached context inject)
 *   UserPromptSubmit → agent/pre-step    (waterfall, can reject)
 *   PreToolUse → tools/pre-execute       (waterfall, deny/ask)
 *   PostToolUse → tools/post-execute     (waterfall, block w/ feedback)
 *   Stop → agent/turn-stopping           (serial; deny forces another step)
 *   SubagentStart/SubagentStop → subagent/start | subagent/end
 *
 * Exposes `KIRO_HOOKS` for the /hooks command: the loaded config entries and
 * a bounded ring of recent invocations. Config is read once at plugin start
 * (platform bridge semantics); a missing file simply registers no hooks.
 *
 * @module @damomoashidamomo/dsh-kiro/hooks
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  matchesMatcher,
  runHook,
  mergeHookOutputs,
  appendHookInvoked,
  appendHookResult,
  createDetachedRuns,
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_STDERR_SUMMARY_MAX_CHARS,
} from '@deepseek-ai/dsh-hook-protocol'
import type { MatcherGroup } from '@deepseek-ai/dsh-hook-protocol'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

/** The seven supported hook points. */
export type HookPoint =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'

const POINTS: readonly HookPoint[] = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop',
]

/** One configured hook as /hooks renders it. */
export interface HookConfigEntry {
  readonly source: 'user' | 'workspace'
  readonly point: HookPoint
  readonly matcher: string | undefined
  readonly command: string
}

/** One recent invocation record (mirrors the durable pair, best-effort). */
export interface HookRunRecord {
  readonly point: HookPoint
  readonly matcher: string | undefined
  readonly decision: string
  readonly exitCode: number | undefined
  readonly durationMs: number
}

/** Service surface the /hooks command reads. */
export interface KiroHooksService {
  /** Where each discovered config file lives, and whether it loaded. */
  readonly sources: readonly { readonly path: string; readonly loaded: boolean; readonly reason?: string }[]
  /** All configured command hooks in run order. */
  readonly entries: readonly HookConfigEntry[]
  /** The most recent invocations (bounded ring). */
  recent(limit?: number): readonly HookRunRecord[]
}

export const KIRO_HOOKS = 'kiroHooks'

/** Module-level handle so /hooks (whose handlers get no ctx) can read state. */
let activeService: KiroHooksService | undefined
export function getKiroHooks(): KiroHooksService | undefined {
  return activeService
}

export const name = 'kiro-hooks'
export const inject = ['shell', 'sessionProjections']

/** Claude-Code-shaped config: `{ hooks: { <Point>: MatcherGroup[] } }`. */
interface HookFile {
  hooks?: Partial<Record<HookPoint, unknown>>
}

/** Parse one config file into per-point matcher groups; command hooks only. */
function parseHookFile(raw: unknown): {
  groups: Partial<Record<HookPoint, MatcherGroup[]>>
  skipped: number
} {
  const groups: Partial<Record<HookPoint, MatcherGroup[]>> = {}
  let skipped = 0
  const file = (raw ?? {}) as HookFile
  const hooks = file.hooks
  if (hooks === null || typeof hooks !== 'object') return { groups, skipped }
  for (const point of POINTS) {
    const listed = hooks[point]
    if (!Array.isArray(listed)) continue
    const parsedGroups: MatcherGroup[] = []
    for (const group of listed) {
      if (group === null || typeof group !== 'object') continue
      const matcher = typeof (group as { matcher?: unknown }).matcher === 'string'
        ? (group as { matcher: string }).matcher
        : undefined
      const rawHooks = (group as { hooks?: unknown }).hooks
      if (!Array.isArray(rawHooks)) continue
      const commandHooks = rawHooks.filter((h): h is { type: string; command: string; timeout?: number } =>
        h !== null && typeof h === 'object' && (h as { type?: unknown }).type === 'command'
        && typeof (h as { command?: unknown }).command === 'string')
      skipped += rawHooks.length - commandHooks.length
      if (commandHooks.length === 0) continue
      parsedGroups.push({
        matcher,
        hooks: commandHooks.map((h) => ({
          command: h.command,
          ...(typeof h.timeout === 'number' ? { timeoutSec: h.timeout } : {}),
        })),
      })
    }
    if (parsedGroups.length > 0) groups[point] = parsedGroups
  }
  return { groups, skipped }
}

/** Read one JSON file, reporting load failures as a source row. */
function loadSource(path: string): { loaded: boolean; reason?: string; parsed?: unknown } {
  try {
    return { loaded: true, parsed: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return { loaded: false, reason: 'not found' }
    return { loaded: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

export function apply(ctx: Context): void {
  const workspaceDir = process.cwd()
  const sources: { path: string; loaded: boolean; reason?: string }[] = []
  const entries: HookConfigEntry[] = []
  const recentRuns: HookRunRecord[] = []
  const RECENT_LIMIT = 50

  // User-level config first, then workspace-level (both run; user first).
  const discovered: { path: string; source: 'user' | 'workspace' }[] = [
    { path: join(homedir(), '.kiro', 'hooks.json'), source: 'user' },
    { path: join(workspaceDir, '.kiro', 'hooks.json'), source: 'workspace' },
  ]

  const merged: Partial<Record<HookPoint, MatcherGroup[]>> = {}
  for (const file of discovered) {
    const result = loadSource(file.path)
    sources.push({ path: file.path, loaded: result.loaded, ...(result.reason !== undefined ? { reason: result.reason } : {}) })
    if (!result.loaded || result.parsed === undefined) continue
    const { groups, skipped } = parseHookFile(result.parsed)
    if (skipped > 0) {
      ctx.logger.warn(`kiro-hooks: ${file.path}: skipped ${skipped} non-command hook(s) (only command hooks run)`)
    }
    for (const point of POINTS) {
      const groupsForPoint = groups[point]
      if (groupsForPoint === undefined) continue
      const existing = merged[point] ?? []
      merged[point] = [...existing, ...groupsForPoint]
      for (const group of groupsForPoint) {
        for (const hook of group.hooks) {
          entries.push({ source: file.source, point, matcher: group.matcher, command: hook.command })
        }
      }
    }
  }

  const service: KiroHooksService = {
    sources,
    entries,
    recent: (limit = 20) => recentRuns.slice(-limit).reverse(),
  }
  ctx.provide(KIRO_HOOKS, service)
  activeService = service
  ctx.effect(() => () => {
    if (activeService === service) activeService = undefined
  }, 'kiro-hooks: clear module handle')

  if (entries.length === 0) return

  const detached = createDetachedRuns()
  ctx.effect(() => () => detached.drain(), 'kiro-hooks: drain detached hook runs')

  let handlerCounter = 0
  const nextHandlerId = (point: HookPoint): string => `kiro:${point}:${++handlerCounter}`
  const PLUGIN_SOURCE = { kind: 'plugin', plugin: 'kiro-hooks' } as const

  /** The last open turn number, or 0 without an agent (audit pairing). */
  const lastTurn = (agent: { session: unknown } | undefined): number => {
    if (agent === undefined) return 0
    try {
      const projections = (ctx as unknown as {
        sessionProjections?: { stateOf?: (session: unknown, kind: string) => { lastTurn: number } }
      }).sessionProjections
      if (projections?.stateOf === undefined) return 0
      return projections.stateOf(agent.session, 'turnBoundary').lastTurn
    } catch {
      return 0
    }
  }

  const recordRun = (record: HookRunRecord): void => {
    recentRuns.push(record)
    if (recentRuns.length > RECENT_LIMIT) recentRuns.splice(0, recentRuns.length - RECENT_LIMIT)
  }

  /**
   * Run every configured hook for `point` whose matcher selects `matchQuery`,
   * with `payload` on stdin; append the audit pair when a turn is open.
   */
  async function runPoint(
    point: HookPoint,
    matchQuery: string,
    payload: unknown,
    opts: {
      agent?: AgentLike
      turn?: number
      signal: AbortSignal
    },
  ) {
    const groups = merged[point] ?? []
    const outputs: Parameters<typeof mergeHookOutputs>[0] = []
    const workdir = opts.agent?.session?.header?.cwd
    const hookEnv = workdir !== undefined ? { CLAUDE_PROJECT_DIR: workdir } : undefined
    for (const group of groups) {
      if (!matchesMatcher(group.matcher, matchQuery, 'claude-code')) continue
      for (const hook of group.hooks) {
        const handlerId = nextHandlerId(point)
        const session = opts.agent?.session as
          | Parameters<typeof appendHookInvoked>[0]
          | undefined
        if (session !== undefined && opts.turn !== undefined) {
          appendHookInvoked(session, {
            turn: opts.turn,
            point,
            dialect: 'claude-code',
            handlerId,
            ...(group.matcher !== undefined ? { matcher: group.matcher } : {}),
          })
        }
        const { output, durationMs } = await runHook(
          (ctx as unknown as { shell: Parameters<typeof runHook>[0] }).shell,
          hook,
          {
            payload,
            defaultTimeoutMs: DEFAULT_HOOK_TIMEOUT_MS,
            ...(hookEnv !== undefined ? { env: hookEnv } : {}),
            ...(workdir !== undefined && isAbsolute(workdir) ? { cwd: workdir } : {}),
            signal: opts.signal,
            trailingNewline: true,
            expectedEventName: point,
          },
          () => performance.now(),
        )
        outputs.push(output)
        if (session !== undefined && opts.turn !== undefined) {
          appendHookResult(session, {
            turn: opts.turn,
            point,
            handlerId,
            output,
            stderrSummaryMaxChars: DEFAULT_STDERR_SUMMARY_MAX_CHARS,
            durationMs,
          })
        }
        recordRun({
          point,
          matcher: group.matcher,
          decision: output.continue === false
            ? 'block'
            : output.decision ?? 'pass',
          exitCode: output.exitCode,
          durationMs,
        })
      }
    }
    return mergeHookOutputs(outputs)
  }

  /** Build additional model context from merged output, or undefined. */
  function contextFrom(merged: ReturnType<typeof mergeHookOutputs>): unknown {
    if (merged.additionalContext.length === 0) return undefined
    return createUserMessage({
      content: merged.additionalContext.map((text) => ({ type: 'text', text })),
      source: PLUGIN_SOURCE,
    })
  }

  // --- payload builders (Claude-Code dialect, script compatible) ---

  const base = (agent: { session: { header?: { id?: string; cwd?: string } } } | undefined, event: string): Record<string, unknown> => ({
    session_id: agent?.session?.header?.id ?? '',
    transcript_path: '',
    cwd: agent?.session?.header?.cwd ?? workspaceDir,
    hook_event_name: event,
  })

  const blocksToText = (content: unknown): string =>
    Array.isArray(content)
      ? (content as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      : ''

  type ExecLike = {
    name: string
    arguments?: unknown
    callId?: string
    signal: AbortSignal
    agent?: AgentLike
  }

  /** Structural agent shape the wirings need (both methods optional). */
  type AgentLike = {
    session: { header?: { id?: string; cwd?: string } }
    inject?(message: unknown): void
    steer?(message: unknown): void
  }

  // --- the seven extension-point wirings ---

  ;(ctx.on as unknown as (event: 'agent/session-start', listener: (payload: { agent: AgentLike; source: string }) => void) => void)('agent/session-start', ({ agent, source }) => {
    detached.track(
      runPoint('SessionStart', source, { ...base(agent, 'SessionStart'), source }, { agent, signal: detached.signal })
        .then((merged) => {
          const context = contextFrom(merged)
          if (context !== undefined) agent.inject?.(context)
        })
        .catch((error: unknown) => {
          ctx.logger.warn(`kiro-hooks: SessionStart hook failed: ${String(error)}`)
        }),
    )
  })

  ;(ctx.on as unknown as (event: 'agent/pre-step', listener: (payload: { agent: AgentLike; messages: { content: unknown }[]; turn: number; signal: AbortSignal }, next: () => Promise<unknown>) => Promise<unknown>) => void)('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
    if (merged.UserPromptSubmit === undefined || messages.length === 0) return next()
    const mergedOutcome = await runPoint('UserPromptSubmit', '', {
      ...base(agent, 'UserPromptSubmit'),
      prompt: blocksToText(messages.flatMap((message) => message.content)),
    }, { agent, turn, signal })
    if (mergedOutcome.decision === 'deny') return { kind: 'reject' }
    const downstream = await next() as { kind?: string; messages?: unknown[] }
    const ours = contextFrom(mergedOutcome)
    if (ours === undefined || downstream.kind !== 'enter') return downstream
    return { ...downstream, messages: [...downstream.messages ?? [], ours] }
  })

  ;(ctx.on as unknown as (event: 'tools/pre-execute', listener: (exec: ExecLike, next: () => Promise<unknown>) => Promise<unknown>) => void)('tools/pre-execute', async (exec, next) => {
    if (merged.PreToolUse === undefined) return next()
    const turn = lastTurn(exec.agent)
    const mergedOutcome = await runPoint('PreToolUse', exec.name, {
      ...base(exec.agent, 'PreToolUse'),
      tool_name: exec.name,
      tool_input: exec.arguments,
      tool_use_id: exec.callId,
    }, { ...(exec.agent !== undefined ? { agent: exec.agent } : {}), turn, signal: exec.signal })
    if (mergedOutcome.decision === 'deny') {
      return { kind: 'deny', reason: mergedOutcome.reason ?? 'blocked by PreToolUse hook' }
    }
    if (mergedOutcome.decision === 'ask') {
      return { kind: 'ask', ...(mergedOutcome.reason !== undefined ? { reason: mergedOutcome.reason } : {}) }
    }
    return next()
  })

  ;(ctx.on as unknown as (event: 'tools/post-execute', listener: (exec: ExecLike & {}, result: { content: unknown }, next: () => Promise<unknown>) => Promise<unknown>) => void)('tools/post-execute', async (exec, result, next) => {
    if (merged.PostToolUse === undefined) return next()
    const turn = lastTurn(exec.agent)
    const mergedOutcome = await runPoint('PostToolUse', exec.name, {
      ...base(exec.agent, 'PostToolUse'),
      tool_name: exec.name,
      tool_input: exec.arguments,
      tool_use_id: exec.callId,
      tool_response: blocksToText(result.content),
    }, { ...(exec.agent !== undefined ? { agent: exec.agent } : {}), turn, signal: exec.signal })
    const context = contextFrom(mergedOutcome)
    if (mergedOutcome.decision === 'deny') {
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: mergedOutcome.reason ?? 'blocked by PostToolUse hook' }],
        ...(context !== undefined ? { additionalContexts: [context] } : {}),
      }
    }
    const downstream = await next() as { kind?: string; additionalContexts?: unknown[] }
    if (context === undefined) return downstream
    return { ...downstream, additionalContexts: [context, ...(downstream.additionalContexts ?? [])] }
  })

  ;(ctx.on as unknown as (event: 'agent/turn-stopping', listener: (payload: { agent: AgentLike; turn: number; signal: AbortSignal }) => Promise<void>) => void)('agent/turn-stopping', async ({ agent, turn, signal }) => {
    const mergedOutcome = await runPoint('Stop', '', { ...base(agent, 'Stop'), stop_hook_active: false }, { agent, turn, signal })
    if (mergedOutcome.decision === 'deny') {
      const text = mergedOutcome.reason ?? 'continue: blocked by Stop hook'
      agent.steer?.(createUserMessage({ content: [{ type: 'text', text }], source: PLUGIN_SOURCE }))
    }
  })

  ;(ctx.on as unknown as (event: 'subagent/start', listener: (info: { id: string; runId: string }) => void) => void)('subagent/start', (info) => {
    detached.track(
      runPoint('SubagentStart', 'general-purpose', {
        ...base(undefined, 'SubagentStart'),
        agent_id: info.id,
        agent_type: 'general-purpose',
      }, { signal: detached.signal })
        .catch((error: unknown) => {
          ctx.logger.warn(`kiro-hooks: SubagentStart hook failed: ${String(error)}`)
        }),
    )
  })

  ;(ctx.on as unknown as (event: 'subagent/end', listener: (info: { id: string; runId: string }) => void) => void)('subagent/end', (info) => {
    detached.track(
      runPoint('SubagentStop', 'general-purpose', {
        ...base(undefined, 'SubagentStop'),
        agent_id: info.id,
        agent_type: 'general-purpose',
        stop_hook_active: false,
      }, { signal: detached.signal }),
    )
  })
}
