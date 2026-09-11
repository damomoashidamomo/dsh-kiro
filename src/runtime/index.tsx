/**
 * kiro-runtime — the Ink render loop. Mounts after the loader settles,
 * creates one Agent through the core registry, binds the SessionController,
 * and renders the App.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime
 */

import { randomUUID } from 'node:crypto'
import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { parseCommand } from '@deepseek-ai/dsh-commands'
import { App } from '../ui/App'
import { SessionController } from './session-controller'
import type { KiroStartup } from '../startup'
import { parseShellCommand, runShell } from '../utils/shell'

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
    },
  })

  const controller = new SessionController()
  controller.bindAgent(ctx, agent)
  controller.patchAgent({
    activeAgent: startup.agent,
    activeModel: startup.model ?? `${selection.provider}/${selection.model}`,
    activeProvider: selection.provider,
    contextLimitTokens: 128_000,
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
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: trimmed }],
      source: { kind: 'user' },
    }))
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
  await sessions.flush(agent.session)
  void commands // referenced via ctx; keep the binding for type narrowing.
}
