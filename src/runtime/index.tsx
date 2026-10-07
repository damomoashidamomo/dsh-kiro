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
import type { Agent, ModelSelection, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { parseCommand } from '@deepseek-ai/dsh-commands'
import { App } from '../ui/App'
import { SessionController } from './session-controller'
import type { KiroStartup } from '../startup'
import { createApprovalAnswerer } from './approval-answerer'
import { createQuestionAnswerer } from './question-answerer'
import type { ApprovalOutcomeLike, ApprovalRequestLike } from './approval-answerer'
import { routeTurnInput } from './turn-input'
import { contextWindowOf } from './model-catalog'
import type { PiAiConfig } from './model-catalog'
import { parseShellCommand, runShell } from '../utils/shell'
import { KIRO_KNOWLEDGE, renderKnowledgeContext } from '../knowledge'
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
  const { agent } = await agents.create({
    sessionId,
    meta: { cwd: process.cwd() },
    agentOptions: {
      provider: startup.model !== undefined ? startup.model.split('/')[0] ?? selection.provider : selection.provider,
      model: startup.model !== undefined ? startup.model.split('/')[1] ?? selection.model : selection.model,
    },
    setup: (agentCtx) => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
      // Live mid-session switch: slash commands (e.g. /model) mutate this ref
      // so the NEXT step's request actually uses the new provider/model —
      // installModelSelection reads selection.current per step; settings
      // writes alone would only persist for the next launch.
      ctx.provide('kiroModelSwitch', {
        apply(next: ModelSelection): void {
          selected.current = next
        },
      })
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
          agent.inject(createUserMessage({
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
    },
  })

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
  // Expose the controller as a Cordis service so slash commands can update
  // the status bar (e.g. /model <provider>/<model> after persisting the new
  // selection) without needing a back-reference to this closure.
  ctx.provide('kiroController', controller)

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
    const knowledge = ctx.get(KIRO_KNOWLEDGE) as KnowledgeStore | undefined
    if (knowledge !== undefined && knowledge.size() > 0) {
      // RAG: inject the top BM25 hits as model-facing context (does not wake
      // the driver and is not rendered into the transcript).
      const hits = knowledge.query(trimmed, 2)
      const block = renderKnowledgeContext(hits)
      if (block !== '') {
        agent.inject(createUserMessage({
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
    if (routeTurnInput(agent, message) === 'steer') {
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
    await agent.whenIdle()
    process.exit(0)
    return
  }

  const app = render(
    <App
      controller={controller}
      seedTask={startup.task}
      activeAgentName={startup.agent}
      onSubmit={submit}
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
    void sessions.flush(agent.session).catch((error: unknown) => {
      ctx.logger('kiro-runtime').warn('session flush failed: %s', String(error))
    })
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
