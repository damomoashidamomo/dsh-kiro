import { jsx as _jsx } from "react/jsx-runtime";
/**
 * kiro-runtime — the Ink render loop. Mounts after the loader settles,
 * creates one Agent through the core registry, binds the SessionController,
 * and renders the App.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime
 */
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { render } from 'ink';
import { brandString } from '@deepseek-ai/dsh-brand';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { parseCommand } from '@deepseek-ai/dsh-commands';
import { App } from "../ui/App.js";
import { SessionController } from "./session-controller.js";
import { parseShellCommand, runShell } from "../utils/shell.js";
import { KIRO_KNOWLEDGE, renderKnowledgeContext } from "../knowledge/index.js";
/** Stable Cordis plugin name. */
export const name = 'kiro-runtime';
/**
 * Declaring the app services in `inject` makes Cordis withhold this plugin's
 * `apply` until every one of them exists, which is the only reliable ordering
 * signal: `ctx.inject(['loader'], …)` fires as soon as the Loader itself
 * exists — long before the bundle patches have created the dsh-base rows.
 */
export const inject = ['kiroStartup', 'agents', 'agentDefaultModel', 'sessions', 'commands'];
/** Mount the Ink render loop once every required service is live. */
export function apply(ctx) {
    const startup = ctx.get('kiroStartup');
    if (startup === undefined) {
        throw new Error('kiro-runtime: the launcher must provide ctx.kiroStartup before the tree mounts');
    }
    // Fire-and-forget exactly like the shipped headless runner: `apply` returns
    // synchronously so the Loader can keep activating rows, and the awaited
    // body resolves once the tree has settled.
    void mount(ctx, startup).catch((error) => {
        process.stderr.write(`dsh-kiro: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
    });
}
async function mount(ctx, startup) {
    // Belt and braces: `inject` already guarantees the services, but the loader
    // await also drains any rows that activate behind us.
    await ctx.get('loader')?.await();
    const agents = ctx.get('agents');
    const defaultModel = ctx.get('agentDefaultModel');
    const sessions = ctx.get('sessions');
    const commands = ctx.get('commands');
    if (agents === undefined || defaultModel === undefined || sessions === undefined) {
        const loader = ctx.get('loader');
        const entryIds = loader !== undefined
            ? [...loader.entries()].map((e) => e.options.id).filter((id) => id !== undefined)
            : [];
        process.stderr.write(`dsh-kiro: required services are not available after inject resolved `
            + `(agents=${String(agents !== undefined)}, agentDefaultModel=${String(defaultModel !== undefined)}, `
            + `sessions=${String(sessions !== undefined)}); loader entries: ${entryIds.slice(0, 20).join(', ')}\n`);
        process.exit(1);
        return;
    }
    const selection = defaultModel.currentSelection();
    const sessionId = brandString(`session-${randomUUID()}`);
    const { agent } = await agents.create({
        sessionId,
        meta: { cwd: process.cwd() },
        agentOptions: {
            provider: startup.model !== undefined ? startup.model.split('/')[0] ?? selection.provider : selection.provider,
            model: startup.model !== undefined ? startup.model.split('/')[1] ?? selection.model : selection.model,
        },
        setup: (agentCtx) => {
            const selected = { current: selection, assembled: undefined };
            installModelSelection(agentCtx, selected);
            // Live mid-session switch: slash commands (e.g. /model) mutate this ref
            // so the NEXT step's request actually uses the new provider/model —
            // installModelSelection reads selection.current per step; settings
            // writes alone would only persist for the next launch.
            ctx.provide('kiroModelSwitch', {
                apply(next) {
                    selected.current = next;
                },
            });
        },
    });
    const controller = new SessionController();
    controller.bindAgent(ctx, agent);
    // activeModel is the bare model id (slice after the first slash, matching
    // /model's parseModel); StatusBar renders provider/model once.
    const bootModel = startup.model ?? `${selection.provider}/${selection.model}`;
    const bootModelId = bootModel.includes('/') ? bootModel.slice(bootModel.indexOf('/') + 1) : bootModel;
    controller.patchAgent({
        activeAgent: startup.agent,
        activeModel: bootModelId,
        activeProvider: selection.provider,
        contextLimitTokens: 128_000,
    });
    // Expose the controller as a Cordis service so slash commands can update
    // the status bar (e.g. /model <provider>/<model> after persisting the new
    // selection) without needing a back-reference to this closure.
    ctx.provide('kiroController', controller);
    // Slash command dispatch: every text submission routes through the parser.
    const submit = (text) => {
        const trimmed = text.trim();
        if (trimmed === '')
            return;
        // Shell escape: `!cmd` runs a host shell command and reports the result
        // as a system message instead of going to the model.
        const shellCommand = parseShellCommand(trimmed);
        if (shellCommand !== undefined) {
            controller.pushSystem(`$ ${shellCommand}`);
            controller.patchAgent({ status: 'running' });
            void runShell(shellCommand)
                .then((result) => {
                const header = result.exitCode === 0 ? '✓' : result.exitCode === null ? '!' : '✗';
                const line1 = `${header} exit=${result.exitCode ?? '?'}  duration=${result.durationMs}ms${result.truncated ? '  truncated' : ''}`;
                const body = result.output === '' ? '(no output)' : result.output;
                controller.pushSystem([line1, body].join('\n'));
            })
                .catch((error) => {
                controller.pushSystem(`shell error: ${error instanceof Error ? error.message : String(error)}`);
            })
                .finally(() => {
                controller.patchAgent({ status: 'idle' });
            });
            return;
        }
        // Slash command dispatch.
        const parsed = parseCommand(trimmed);
        if (parsed !== undefined && commands !== undefined) {
            commands.execute(agent, trimmed, [], new AbortController().signal)
                .then((outcome) => {
                if (outcome === undefined) {
                    controller.pushSystem(`Unknown command: /${parsed.name}`);
                    return;
                }
                // /clear additionally wipes the visible transcript.
                if (parsed.name === 'clear')
                    controller.clearTranscript();
                if (outcome.result.kind === 'success' && outcome.result.text !== undefined) {
                    controller.pushSystem(outcome.result.text);
                }
                else if (outcome.result.kind === 'error') {
                    controller.pushSystem(outcome.result.text);
                }
            })
                .catch((error) => {
                controller.pushSystem(`/${parsed.name} failed: ${error instanceof Error ? error.message : String(error)}`);
            });
            return;
        }
        // Plain text → agent followup.
        const knowledge = ctx.get(KIRO_KNOWLEDGE);
        if (knowledge !== undefined && knowledge.size() > 0) {
            // RAG: inject the top BM25 hits as model-facing context (does not wake
            // the driver and is not rendered into the transcript).
            const hits = knowledge.query(trimmed, 2);
            const block = renderKnowledgeContext(hits);
            if (block !== '') {
                agent.inject(createUserMessage({
                    content: [{ type: 'text', text: block }],
                    source: { kind: 'plugin', plugin: 'kiro-knowledge' },
                }));
            }
        }
        agent.followup(createUserMessage({
            content: [{ type: 'text', text: trimmed }],
            source: { kind: 'user' },
        }));
    };
    // Non-TTY mode: process the task and exit without booting Ink.
    if (startup.noInteractive === true) {
        if (startup.task === undefined) {
            process.stderr.write('dsh-kiro: --no-interactive requires a positional task\n');
            process.exit(2);
        }
        submit(startup.task);
        await agent.whenIdle();
        process.exit(0);
        return;
    }
    const app = render(_jsx(App, { controller: controller, seedTask: startup.task, activeAgentName: startup.agent, onSubmit: submit }), { exitOnCtrlC: false, patchConsole: false });
    await app.waitUntilExit();
    // Hand control to the launcher's bounded shutdown (`appExit` →
    // `shutdown.shutdown(0)` → tree disposal → natural exit). The dsh boot
    // keeps handles alive after the TUI unmounts (patch-watch timers from
    // `patchReload: "live"`, hmr watchers, LLM keepalives, …), and the
    // shutdown controller knows how to tear those down — and force-exit
    // within its grace period if disposal stalls.
    const appExit = ctx.get('appExit');
    if (appExit !== undefined) {
        // Fire the session flush in the background and DO NOT await it: in some
        // boots `sessions.flush` never settles, and blocking the exit on it
        // would turn every quit into a multi-second stall. The tree disposal
        // persists the session through its own lifecycle hooks.
        void sessions.flush(agent.session).catch((error) => {
            ctx.logger('kiro-runtime').warn('session flush failed: %s', String(error));
        });
        appExit(0);
        // Last-resort failsafe: a tiny unref'd worker thread that SIGKILLs the
        // process if it is somehow still alive after the shutdown's 5s grace.
        // A main-thread timer would be defeated by a busy-loop stall in tree
        // disposal (which also blocks the forceExit), but the worker runs on its
        // own thread. Unref'd, so the normal fast exit path is unaffected.
        try {
            const killer = new Worker('setTimeout(() => process.kill(process.pid, "SIGKILL"), 8000)', { eval: true });
            killer.unref();
        }
        catch {
            // Failsafe is best-effort; the bounded shutdown still covers us.
        }
        return;
    }
    // No launcher exit hook (bare tests / direct boots): exit directly.
    process.exit(0);
    void commands; // referenced via ctx; keep the binding for type narrowing.
}
//# sourceMappingURL=index.js.map