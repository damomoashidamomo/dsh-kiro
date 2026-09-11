/**
 * dsh-kiro CLI startup — Commander adapter that parses the inner arguments
 * handed over by the `dsh --profile kiro` launcher, publishes a typed
 * `kiroStartup` service, and prints the TUI's `--help`.
 *
 * The launcher (`apps/cli/src/args.ts`) parses only `--profile`/`--patch`/
 * `--dump-config` and hands everything after them verbatim. This startup
 * plugin owns its flag family and its `--help` text — `--resume`, `--agent`,
 * `--list-models`, `--trust-all-tools`, etc. all live here.
 *
 * Mirrors `@deepseek-ai/dsh-web-app/startup` and `@deepseek-ai/dsh-headless/startup`
 * in shape, but provides a richer flag surface tuned for the Kiro CLI parity.
 *
 * @module @damomoashidamomo/dsh-kiro/startup
 */

import { Command, CommanderError } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import {
  parseCmdline,
  type AppExit,
} from '@deepseek-ai/dsh-cmdline'
import { banner } from './theme/palette'
import { BANNER } from './theme/banner'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Resolved CLI values from `dsh --profile kiro` arguments. Provided once on startup. */
    kiroStartup?: KiroStartup
  }
}

/** Stable Cordis plugin name. */
export const name = 'kiro-startup'

/** Core services required before the CLI is parsed. */
export const inject = ['cmdlineArgs']

/** Service identifier published by this plugin's action. */
export const KIRO_STARTUP = 'kiroStartup'

/** Single tool names that the CLI may pre-trust at startup. */
export type TrustList = 'all' | readonly string[]

/** Resolved startup values. */
export interface KiroStartup {
  /** Positional task text — when present the TUI seeds the prompt with it. */
  readonly task: string | undefined
  /** Restore the most recent session from the current workspace. */
  readonly resume: boolean
  /** Restore an explicit session by id. */
  readonly resumeId: string | undefined
  /** Open the resume picker instead of starting a session. */
  readonly resumePicker: boolean
  /** List all stored sessions and exit without booting the TUI. */
  readonly listSessions: boolean
  /** Delete a stored session by id and exit. */
  readonly deleteSessionId: string | undefined
  /** Restrict --delete-session lookups to one storage source. */
  readonly sessionSource: 'v1' | 'v2' | undefined
  /** List available models and exit without booting the TUI. */
  readonly listModels: boolean
  /** Override the model the agent selects at session start. */
  readonly model: string | undefined
  /** Reasoning-effort override, model-dependent. */
  readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined
  /** Agent engine override. */
  readonly agentEngine: 'v2' | 'v1' | 'kas' | undefined
  /** Agent mode — vibe (default) or spec. */
  readonly mode: 'vibe' | 'spec' | undefined
  /** Pre-trust all built-in tools. */
  readonly trustAllTools: boolean
  /** Pre-trust a comma-separated list of tool names. */
  readonly trustTools: readonly string[] | undefined
  /** Run non-interactively — process the task and exit. */
  readonly noInteractive: boolean
  /** Output format for the non-interactive mode. */
  readonly format: 'plain' | 'json' | 'json-pretty' | undefined
  /** Require every configured MCP server to start successfully. */
  readonly requireMcpStartup: boolean
  /** Use the TUI surface. */
  readonly tui: boolean
  /** Force the legacy (no-Ink) surface for parity checks. */
  readonly legacy: boolean
  /** Wrap mode for stdout. */
  readonly wrap: 'always' | 'never' | 'auto' | undefined
  /** Verbosity for diagnostic logging. */
  readonly verbose: number
  /** Profile name override for the launched agent. */
  readonly agent: string | undefined
}

/** Construct the Kiro TUI commander program. */
function kiroCommand(): Command {
  const cmd = new Command()
    .name('dsh --profile kiro')
    .description('Launch the dsh-kiro TUI — Kiro-CLI-compatible agent for DeepSeek Harness.')
    .helpOption('-h, --help', 'show this help')
    .argument('[task...]', 'optional first prompt to seed the TUI with; multiple words are joined by spaces')
    .option('-r, --resume', 'resume the most recent session from the current working directory')
    .option('--resume-id <id>', 'resume a specific session by id')
    .option('--resume-picker, --list', 'open an interactive resume picker before booting the TUI')
    .option('-l, --list-sessions', 'list stored sessions for the current directory and exit')
    .option('-d, --delete-session <id>', 'delete a stored session by id and exit')
    .option('--session-source <v1|v2>', 'restrict --delete-session lookup to one storage source')
    .option('--list-models', 'list available models and exit')
    .option('--agent <agent>', 'start the TUI with a custom agent by name')
    .option('--model <model>', 'override the model the agent selects')
    .option('--effort <level>', 'reasoning-effort override: low | medium | high | xhigh | max')
    .option('--agent-engine <v2|v1|kas>', 'select the agent engine; default is v2')
    .option('--mode <vibe|spec>', 'agent mode: vibe (default) or spec')
    .option('-a, --trust-all-tools', 'pre-trust all built-in tools without prompting')
    .option('--trust-tools <list>', 'pre-trust a comma-separated list of tool names')
    .option('--no-interactive', 'run non-interactively — process the task and exit')
    .option('-f, --format <plain|json|json-pretty>', 'output format for non-interactive mode')
    .option('--require-mcp-startup', 'fail boot if any configured MCP server does not start')
    .option('--tui', 'use the rich terminal UI (default)')
    .option('--legacy, --classic', 'use the legacy non-Ink surface')
    .option('-w, --wrap <always|never|auto>', 'wrap long lines in the transcript')
    .option('-v, --verbose', 'increase diagnostic verbosity (repeatable)', (_, prev: number) => prev + 1, 0)
    .addHelpText('after', `
Examples:
  dsh --profile kiro                              start the TUI with a fresh session
  dsh --profile kiro -r                           resume the most recent session in cwd
  dsh --profile kiro --resume-picker              open an interactive resume picker
  dsh --profile kiro --agent backend-specialist  start with a custom agent
  dsh --profile kiro --list-models                list available models and exit
  dsh --profile kiro "fix the failing test"       seed the prompt with a task
`)
  return cmd
}

/**
 * Parse one Commander program into a typed {@link KiroStartup}. Throws when
 * a flag carries an invalid value; Commander handles help/version/rejection
 * internally so we never see those here.
 */
function readStartup(program: Command): KiroStartup {
  const opts = program.opts<{
    resume?: boolean
    resumeId?: string
    resumePicker?: boolean
    listSessions?: boolean
    deleteSession?: string
    sessionSource?: 'v1' | 'v2'
    listModels?: boolean
    agent?: string
    model?: string
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    agentEngine?: 'v2' | 'v1' | 'kas'
    mode?: 'vibe' | 'spec'
    trustAllTools?: boolean
    trustTools?: string
    noInteractive?: boolean
    format?: 'plain' | 'json' | 'json-pretty'
    requireMcpStartup?: boolean
    tui?: boolean
    legacy?: boolean
    wrap?: 'always' | 'never' | 'auto'
    verbose?: number
  }>()

  const taskArg = (program.args as readonly string[]).join(' ').trim()
  const trustList: readonly string[] | undefined = opts.trustTools === undefined
    ? undefined
    : opts.trustTools.split(',').map(entry => entry.trim()).filter(entry => entry !== '')

  return {
    task: taskArg === '' ? undefined : taskArg,
    resume: opts.resume === true,
    resumeId: opts.resumeId,
    resumePicker: opts.resumePicker === true,
    listSessions: opts.listSessions === true,
    deleteSessionId: opts.deleteSession,
    sessionSource: opts.sessionSource,
    listModels: opts.listModels === true,
    agent: opts.agent,
    model: opts.model,
    effort: opts.effort,
    agentEngine: opts.agentEngine,
    mode: opts.mode,
    trustAllTools: opts.trustAllTools === true,
    trustTools: trustList,
    noInteractive: opts.noInteractive === true,
    format: opts.format,
    requireMcpStartup: opts.requireMcpStartup === true,
    tui: opts.tui !== false,
    legacy: opts.legacy === true,
    wrap: opts.wrap,
    verbose: opts.verbose ?? 0,
  }
}

/** Validate flag combinations before publishing. */
function validate(startup: KiroStartup, program: Command): void {
  if (startup.resume && startup.resumeId !== undefined) {
    program.error('error: --resume and --resume-id are mutually exclusive')
  }
  if (startup.listSessions && startup.listModels) {
    program.error('error: --list-sessions and --list-models are mutually exclusive')
  }
  if (startup.deleteSessionId !== undefined && (startup.listSessions || startup.listModels || startup.task !== undefined)) {
    program.error('error: --delete-session takes no other action flags')
  }
  if (startup.noInteractive && startup.task === undefined) {
    program.error('error: --no-interactive requires a positional task')
  }
  if (startup.format !== undefined && !startup.noInteractive) {
    program.error('error: --format only applies to --no-interactive mode')
  }
}

/** Print --list-models and exit. */
async function printModels(ctx: Context, exit: AppExit): Promise<void> {
  void ctx.get('agents') // Reserved for future /agent integration.
  const defaultModel = ctx.get('agentDefaultModel')
  if (defaultModel === undefined) {
    process.stderr.write('dsh-kiro: agentDefaultModel service is not available\n')
    exit(1)
    return
  }
  // dsh-agent-default-model exposes currentSelection() and a settings-backed
  // source. It does not advertise a model catalog method directly; print the
  // current selection and reference the underlying dsh-llm registry for the
  // full list.
  const selection = defaultModel.currentSelection()
  const lines: string[] = []
  lines.push('Default selection:')
  lines.push(` * ${selection.provider}/${selection.model}`)
  lines.push('')
  lines.push('(See /model <provider/model> to override; the live catalog is published')
  lines.push(' by the @deepseek-ai/dsh-llm plugins mounted by dsh-base.)')
  process.stdout.write(`${lines.join('\n')}\n`)
  exit(0)
}

/** Mount the kiro-startup plugin. */
export function apply(ctx: Context): void {
  const program = kiroCommand()
  program.action(() => {
    const startup = readStartup(program)
    validate(startup, program)
    const exit = ctx.get('appExit')
    if (exit === undefined) {
      program.error('error: launcher did not provide ctx.appExit')
      return
    }
    if (startup.listModels) {
      void printModels(ctx, exit)
      return
    }
    if (startup.listSessions) {
      // Defer to the commands plugin so the same formatter is reused.
      ctx.provide('kiroStartupListSessions', true)
    }
    if (startup.deleteSessionId !== undefined) {
      ctx.provide('kiroStartupDeleteSession', startup.deleteSessionId)
      if (startup.sessionSource !== undefined) {
        ctx.provide('kiroStartupSessionSource', startup.sessionSource)
      }
    }
    ctx.provide(KIRO_STARTUP, startup)
  })

  // Pre-print the splash banner so the TUI does not need to. Commander's
  // --help exits before our action runs, so this is the only place we can
  // hook the banner.
  const originalHelp = program.helpInformation.bind(program)
  program.helpInformation = function helpWithBanner(): string {
    return `${banner(BANNER)}\n${originalHelp()}`
  }

  try {
    parseCmdline(ctx, program)
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exit(error.exitCode)
    }
    throw error
  }
}
