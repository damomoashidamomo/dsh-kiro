/**
 * kiro-runtime — the Ink render loop. Mounts after the loader settles,
 * creates one Agent through the core registry, binds the SessionController,
 * and renders the App.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime
 */

import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, AgentSetup, ModelSelection, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { parseCommand } from '@deepseek-ai/dsh-commands'
import { App } from '../ui/App'
import type { AutocompleteItem } from '../ui/Autocomplete'
import { SessionController } from './session-controller'
import type { KiroStartup } from '../startup'
import { createApprovalAnswerer } from './approval-answerer'
import { createQuestionAnswerer } from './question-answerer'
import type { ApprovalOutcomeLike, ApprovalRequestLike } from './approval-answerer'
import { routeTurnInput } from './turn-input'
import { detectEffortHint, resolveAutoEffort } from './effort-keywords'
import { contextWindowOf } from './model-catalog'
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import type { LocalFileReferenceService } from '@deepseek-ai/dsh-file-reference-local'
import type { PiAiConfig } from './model-catalog'
import { parseShellCommand, runShell } from '../utils/shell'
import { KIRO_KNOWLEDGE, renderKnowledgeContext } from '../knowledge'
import { filterSessions, listSessions } from '../utils/sessions'
import type { KnowledgeStore } from '../knowledge/store'

/** Stable Cordis plugin name. */
export const name = 'kiro-runtime'

/**
 * Declaring the app services in `inject` makes Cordis withhold this plugin's
 * `apply` until every one of them exists, which is the only reliable ordering
 * signal: `ctx.inject(['loader'], …)` fires as soon as the Loader itself
 * exists — long before the bundle patches have created the dsh-base rows.
 */
export const inject = ['kiroStartup', 'agents', 'agentDefaultModel', 'sessions', 'commands']

/** Mount the Ink render loop once every required service is live. */
export function apply(ctx: Context): void {
  const startup = ctx.get('kiroStartup')
  if (startup === undefined) {
    throw new Error('kiro-runtime: the launcher must provide ctx.kiroStartup before the tree mounts')
  }
  // Fire-and-forget exactly like the shipped headless runner: `apply` returns
  // synchronously so the Loader can keep activating rows, and the awaited
  // body resolves once the tree has settled.
  void mount(ctx, startup).catch((error: unknown) => {
    process.stderr.write(`dsh-kiro: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}

async function mount(ctx: Context, startup: KiroStartup): Promise<void> {
  // Belt and braces: `inject` already guarantees the services, but the loader
  // await also drains any rows that activate behind us.
  await ctx.get('loader')?.await()

  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  const commands = ctx.get('commands')
  if (agents === undefined || defaultModel === undefined || sessions === undefined) {
    const loader = ctx.get('loader')
    const entryIds = loader !== undefined
      ? [...loader.entries()].map((e) => e.options.id).filter((id): id is string => id !== undefined)
      : []
    process.stderr.write(
      `dsh-kiro: required services are not available after inject resolved `
      + `(agents=${String(agents !== undefined)}, agentDefaultModel=${String(defaultModel !== undefined)}, `
      + `sessions=${String(sessions !== undefined)}); loader entries: ${entryIds.slice(0, 20).join(', ')}\n`,
    )
    process.exit(1)
    return
  }

  const selection = defaultModel.currentSelection()
  const sessionId = brandString<SessionId>(`session-${randomUUID()}`)
  // The controller is created BEFORE the agent so the agent-scoped listeners
  // registered in `setup` can drive its approval panel immediately.
  const controller = new SessionController()
  // Model selection + reasoning-effort state live in mount scope so both
  // the agent-scoped setup and the TUI submit path share one source.
  const selected: ModelSelectionRef = { current: selection, assembled: undefined }
  let agentCtxRef: unknown
  // Reasoning-effort control (habits analysis B-plan): /effort sets a
  // manual level (persisted via agentDefaultModel); prompts with
  // escalation keywords auto-raise for THAT turn unless the user pinned
  // a manual level. Models whose settings entry declares no
  // reasoningEfforts are skipped gracefully — the dial does not exist
  // for them.
  const effortControl = {
    manual: undefined as string | undefined,
    lastAuto: undefined as string | undefined,
    capabilityWarned: new Set<string>(),
    declaredLevels(providerName: string, modelId: string): readonly string[] | undefined {
      try {
        const settings = ctx.get('settings') as { get?: (ns: string) => unknown } | undefined
        const piAi = settings?.get?.('llm-pi-ai') as {
          providers?: Record<string, { models?: { id: string; reasoningEfforts?: Record<string, unknown> }[] }>
        } | undefined
        const entry = piAi?.providers?.[providerName]?.models?.find((m) => m.id === modelId)
        if (entry?.reasoningEfforts !== undefined && typeof entry.reasoningEfforts === 'object') {
          return Object.keys(entry.reasoningEfforts)
        }
      } catch {
        // settings unavailable: treat as undeclared
      }
      return undefined
    },
    setManual(level: string): void {
      this.manual = level
      this.lastAuto = undefined
    },
    current(): string | undefined {
      return this.manual ?? this.lastAuto
    },
  }

  // The live agent behind the TUI. Session switching (/chat resume, /chat new)
  // swaps it WITHOUT unmounting Ink — every closure below reads the ref so
  // submissions, cancels, flushes, and steering always target the CURRENT agent.
  const agentRef: { current: Agent | undefined } = { current: undefined }
  let agentHandle: AgentHandle | undefined

  const agentOptions = {
    provider: startup.model !== undefined ? startup.model.split('/')[0] ?? selection.provider : selection.provider,
    model: startup.model !== undefined ? startup.model.split('/')[1] ?? selection.model : selection.model,
  }

  /**
   * Agent-scoped wiring shared by create AND resume: approval answerer, plan
   * review, model/effort services. Defined once so a switched-to session gets
   * the exact same world.
   */
  // Agent-independent services, provided ONCE at the runtime scope: setup
  // runs again on every session switch, and re-providing would throw
  // "already registered". All of these reach the CURRENT agent via agentRef.
  ctx.provide('kiroEffortControl', effortControl)
  ctx.provide('kiroInterrupt', {
    cancel(): void {
      try {
        agentRef.current?.cancel({ kind: 'user' })
      } catch {
        // already idle or already cancelled — no-op
      }
    },
  })
  ctx.provide('kiroModelSwitch', {
    apply(next: ModelSelection): void {
      selected.current = next
    },
  })

  const setupAgent: AgentSetup = (agentCtx) => {
      agentCtxRef = agentCtx
      installModelSelection(agentCtx, selected)
      // kiro-style tool-permission panel: answer the platform's
      // `approval/request` waterfall (dsh-user-approval). Registered on the
      // agent scope so only this agent's questions reach the TUI. The event's
      // cordis type augmentation ships with dsh-user-approval, which this
      // bundle does not type-depend on — hence the structural cast.
      const onApprovalRequest = agentCtx.on as unknown as (
        event: 'approval/request',
        listener: (req: ApprovalRequestLike) => Promise<ApprovalOutcomeLike>,
      ) => void
      onApprovalRequest('approval/request', createApprovalAnswerer(controller, {
        inject: (text) => {
          agentRef.current?.inject(createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: 'user' },
          }))
        },
      }))
      // kiro-style plan review: answer the platform's `user-questions/request`
      // waterfall (dsh-user-questions) so `exit_plan_mode` (dsh-plan-mode) can
      // put its review to the human instead of failing with NO_PROVIDER.
      // Agent-scoped like the approval answerer; this bundle DOES depend on
      // dsh-user-questions, so the typed augmentation applies.
      agentCtx.on('user-questions/request', createQuestionAnswerer(controller))
  }

  // --resume-id <id> resumes that persisted session; bare --resume picks the
  // most recent one for this cwd. agents.resume loads the persisted log so
  // the model continues with full history; the transcript is replayed after
  // bind via sessionQuery.readSession.
  const bootResumeId = startup.resumeId !== undefined
    ? startup.resumeId
    : startup.resume === true
      ? filterSessions(listSessions(), { cwd: process.cwd() }).at(0)?.id
      : undefined
  if (bootResumeId !== undefined) {
    agentHandle = await agents.resume({
      resumeSessionId: brandString<SessionId>(bootResumeId),
      agentOptions,
      setup: setupAgent,
    })
  } else {
    agentHandle = await agents.create({ sessionId, meta: { cwd: process.cwd() }, agentOptions, setup: setupAgent })
  }
  agentRef.current = agentHandle.agent
  const agent = agentHandle.agent

  /**
   * Replay a persisted session's events into the transcript (resume). The
   * tail is kept (300 events) — the transcript is a viewport, not an archive.
   */
  const seedHistory = async (id: string): Promise<number> => {
    try {
      const query = (ctx as unknown as { get?: <T>(key: string) => unknown }).get?.('sessionQuery') as
        | { readSession?: (id: SessionId) => Promise<{ events: unknown[] }> }
        | undefined
      if (query?.readSession === undefined) return 0
      const snapshot = await query.readSession(brandString<SessionId>(id))
      const events = (snapshot.events ?? []) as never[]
      controller.replayEvents(events.slice(-300))
      return events.length
    } catch {
      return 0
    }
  }
  controller.bindAgent(ctx, agent)
  // activeModel is the bare model id (slice after the first slash, matching
  // /model's parseModel); StatusBar renders provider/model once.
  const bootModel = startup.model ?? `${selection.provider}/${selection.model}`
  const bootModelId = bootModel.includes('/') ? bootModel.slice(bootModel.indexOf('/') + 1) : bootModel
  // Read the model catalog for the boot model's declared context window.
  const settingsCtx = (ctx as unknown as { get?: <T>(key: string) => T | undefined })
  const piAiBoot = typeof settingsCtx.get === 'function'
    ? settingsCtx.get<PiAiConfig>('settings') as { get?: (ns: string) => unknown } | undefined
    : undefined
  const piAi = piAiBoot?.get !== undefined ? piAiBoot.get('llm-pi-ai') as PiAiConfig | undefined : undefined
  const bootModelWindow = contextWindowOf(piAi, selection.provider, bootModelId)
  controller.patchAgent({
    activeAgent: startup.agent,
    activeModel: bootModelId,
    activeProvider: selection.provider,
    // The catalog's declared window for the BOOT model — no invented
    // default: models without a contextWindow show bare token usage.
    contextLimitTokens: bootModelWindow ?? undefined,
  })
  // Transcript replay must run AFTER bindAgent (bind resets state).
  if (bootResumeId !== undefined) await seedHistory(bootResumeId)
  // Expose the controller as a Cordis service so slash commands can update
  // the status bar (e.g. /model <provider>/<model> after persisting the new
  // selection) without needing a back-reference to this closure.
  ctx.provide('kiroController', controller)

  // In-TUI session switching (/chat resume <id>, /chat new): swap the live
  // agent without unmounting Ink. flush + dispose the old agent, resume (or
  // create) through the registry with the SAME setup, rebind, replay history.
  ctx.provide('kiroSessionSwitch', {
    async switchTo(target: string | undefined): Promise<{ ok: boolean; message: string }> {
      try {
        const current = agentRef.current
        if (current !== undefined) {
          try {
            await sessions.flush(current.session)
          } catch {
            // Best-effort: switching must not strand the user on a flush bug.
          }
        }
        controller.unbind()
        try {
          await agentHandle?.dispose()
        } catch {
          // Best-effort teardown; the registry refuses double-dispose.
        }
        agentHandle = target === undefined
          ? await agents.create({
              sessionId: brandString<SessionId>(`session-${randomUUID()}`),
              meta: { cwd: process.cwd() },
              agentOptions,
              setup: setupAgent,
            })
          : await agents.resume({
              resumeSessionId: brandString<SessionId>(target),
              agentOptions,
              setup: setupAgent,
            })
        agentRef.current = agentHandle.agent
        // bindAgent resets the transcript; re-apply the status-bar model facts
        // (they live in agent state, which the reset clears).
        controller.bindAgent(ctx, agentHandle.agent)
        controller.patchAgent({
          activeAgent: startup.agent,
          activeModel: bootModelId,
          activeProvider: selection.provider,
          contextLimitTokens: bootModelWindow ?? undefined,
        })
        if (target === undefined) {
          controller.pushSystem('◇ 已开启新会话（原会话已存盘）。')
          return { ok: true, message: '已开启新会话。' }
        }
        const total = await seedHistory(target)
        controller.pushSystem(`◇ 已恢复会话 ${target}（回放最近 ${Math.min(total, 300)}/${total} 条事件）。`)
        return { ok: true, message: `已恢复会话 ${target}。` }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        controller.pushSystem(`✗ 会话切换失败：${message}`)
        return { ok: false, message: `切换失败：${message}` }
      }
    },
  })

  // Slash command dispatch: every text submission routes through the parser.
  const submit = (text: string): void => {
    const trimmed = text.trim()
    if (trimmed === '') return

    // Shell escape: `!cmd` runs a host shell command and reports the result
    // as a system message instead of going to the model.
    const shellCommand = parseShellCommand(trimmed)
    if (shellCommand !== undefined) {
      controller.pushSystem(`$ ${shellCommand}`)
      controller.patchAgent({ status: 'running' })
      void runShell(shellCommand)
        .then((result) => {
          const header = result.exitCode === 0 ? '✓' : result.exitCode === null ? '!' : '✗'
          const line1 = `${header} exit=${result.exitCode ?? '?'}  duration=${result.durationMs}ms${result.truncated ? '  truncated' : ''}`
          const body = result.output === '' ? '(no output)' : result.output
          controller.pushSystem([line1, body].join('\n'))
        })
        .catch((error: unknown) => {
          controller.pushSystem(`shell error: ${error instanceof Error ? error.message : String(error)}`)
        })
        .finally(() => {
          controller.patchAgent({ status: 'idle' })
        })
      return
    }

    // Slash command dispatch.
    const parsed = parseCommand(trimmed)
    if (parsed !== undefined && commands !== undefined) {
      commands.execute(agent, trimmed, [], new AbortController().signal)
        .then((outcome) => {
          if (outcome === undefined) {
            controller.pushSystem(`Unknown command: /${parsed.name}`)
            return
          }
          // /clear additionally wipes the visible transcript.
          if (parsed.name === 'clear') controller.clearTranscript()
          if (outcome.result.kind === 'success' && outcome.result.text !== undefined) {
            controller.pushSystem(outcome.result.text)
          } else if (outcome.result.kind === 'error') {
            controller.pushSystem(outcome.result.text)
          }
        })
        .catch((error: unknown) => {
          controller.pushSystem(`/${parsed.name} failed: ${error instanceof Error ? error.message : String(error)}`)
        })
      return
    }

    // Plain text → agent followup.
    // Keyword escalation (B-plan): '深入分析'/'ultrathink' style phrases
    // raise the effort for THIS turn; a manual /effort wins and is never
    // overridden. Applied only when the current model declares the level.
    {
      const hinted = detectEffortHint(trimmed)
      const agentState = controller.getState().agent
      const providerName = agentState.activeProvider
      const modelId = agentState.activeModel
      if (hinted !== undefined && effortControl.manual === undefined && providerName !== undefined && modelId !== undefined) {
        const declared = effortControl.declaredLevels(providerName, modelId)
        const effective = resolveAutoEffort(hinted, undefined, declared)
        if (effective !== undefined && effortControl.lastAuto !== effective) {
          effortControl.lastAuto = effective
          // ReasoningEffortId is a branded string; the keyword table only
          // produces the pi-ai level spellings, so the cast is sound.
          selected.current = { ...selected.current, reasoningEffort: effective } as typeof selected.current
          controller.pushSystem(`◆ 本回合思考档位：${effective}（关键词触发；/effort <level> 可固定）`)
        } else if (declared !== undefined && !effortControl.capabilityWarned.has(modelId)) {
          effortControl.capabilityWarned.add(modelId)
          controller.pushSystem(`ℹ ${modelId} 未声明思考档位，关键词升档对本模型不生效。`)
        }
      }
    }
    const knowledge = ctx.get(KIRO_KNOWLEDGE) as KnowledgeStore | undefined
    if (knowledge !== undefined && knowledge.size() > 0) {
      // RAG: inject the top BM25 hits as model-facing context (does not wake
      // the driver and is not rendered into the transcript).
      const hits = knowledge.query(trimmed, 2)
      const block = renderKnowledgeContext(hits)
      if (block !== '') {
        agentRef.current?.inject(createUserMessage({
          content: [{ type: 'text', text: block }],
          source: { kind: 'plugin', plugin: 'kiro-knowledge' },
        }))
      }
    }
    const message = createUserMessage({
      content: [{ type: 'text', text: trimmed }],
      source: { kind: 'user' },
    })
    // A running turn turns this submission into mid-flight steering — the
    // live turn's next step boundary consumes it (kiro-style interjection,
    // no cancel needed). Idle (or cancelling — platform rule: input after an
    // active cancellation queues for the next turn) opens/queues a new turn.
    const live = agentRef.current
    if (live !== undefined && routeTurnInput(live, message) === 'steer') {
      const preview = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
      controller.noteSteered(trimmed)
      controller.pushSystem(`↪ 已插话（下一步生效）：${preview}`)
    }
  }

  // Non-TTY mode: process the task and exit without booting Ink.
  if (startup.noInteractive === true) {
    if (startup.task === undefined) {
      process.stderr.write('dsh-kiro: --no-interactive requires a positional task\n')
      process.exit(2)
    }
    submit(startup.task)
    await agentRef.current?.whenIdle()
    process.exit(0)
    return
  }

  // @-mention search: the platform's fileReferences service (loaded by the
  // file-reference-local patch row) walks the workspace with sensible
  // excludes; candidates map into the TUI autocomplete items.
  // The base service type lacks `list` (it ships with the local provider);
  // narrow to the local class the file-reference-local patch row mounts.
  const fileRefs = ctx.get('fileReferences') as LocalFileReferenceService | undefined
  const fileSearch = fileRefs?.list !== undefined
    ? (query: string): Promise<readonly AutocompleteItem[]> => {
        const timeout = new AbortController()
        const timer = setTimeout(() => { timeout.abort() }, 4000)
        return fileRefs.list(agent, query, timeout.signal)
          .then((candidates) => candidates.map((candidate) => ({
            insert: formatFileMention(candidate, false) ?? `${candidate.path} `,
            label: candidate.kind === 'directory' ? `${candidate.path}/` : candidate.path,
            hint: candidate.kind === 'directory' ? 'dir' : undefined,
          })))
          .finally(() => { clearTimeout(timer) })
      }
    : undefined

  const app = render(
    <App
      controller={controller}
      seedTask={startup.task}
      activeAgentName={startup.agent}
      onSubmit={submit}
      fileSearch={fileSearch}
    />,
    { exitOnCtrlC: false, patchConsole: false },
  )

  await app.waitUntilExit()

  // Hand control to the launcher's bounded shutdown (`appExit` →
  // `shutdown.shutdown(0)` → tree disposal → natural exit). The dsh boot
  // keeps handles alive after the TUI unmounts (patch-watch timers from
  // `patchReload: "live"`, hmr watchers, LLM keepalives, …), and the
  // shutdown controller knows how to tear those down — and force-exit
  // within its grace period if disposal stalls.
  const appExit = ctx.get('appExit')
  if (appExit !== undefined) {
    // Fire the session flush in the background and DO NOT await it: in some
    // boots `sessions.flush` never settles, and blocking the exit on it
    // would turn every quit into a multi-second stall. The tree disposal
    // persists the session through its own lifecycle hooks.
    const exitSession = agentRef.current?.session
    if (exitSession !== undefined) {
      void sessions.flush(exitSession).catch((error: unknown) => {
        ctx.logger('kiro-runtime').warn('session flush failed: %s', String(error))
      })
    }
    appExit(0)
    // Last-resort failsafe: a tiny unref'd worker thread that SIGKILLs the
    // process if it is somehow still alive after the shutdown's 5s grace.
    // A main-thread timer would be defeated by a busy-loop stall in tree
    // disposal (which also blocks the forceExit), but the worker runs on its
    // own thread. Unref'd, so the normal fast exit path is unaffected.
    try {
      const killer = new Worker(
        'setTimeout(() => process.kill(process.pid, "SIGKILL"), 8000)',
        { eval: true },
      )
      killer.unref()
    } catch {
      // Failsafe is best-effort; the bounded shutdown still covers us.
    }
    return
  }
  // No launcher exit hook (bare tests / direct boots): exit directly.
  process.exit(0)
  void commands // referenced via ctx; keep the binding for type narrowing.
}
