import { jsx as _jsx } from "react/jsx-runtime";
/**
 * kiro-runtime — the Ink render loop. Mounts after the loader settles,
 * creates one Agent through the core registry, binds the SessionController,
 * and renders the App.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime
 */
import { randomUUID } from 'node:crypto';
import { render } from 'ink';
import { brandString } from '@deepseek-ai/dsh-brand';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { parseCommand } from '@deepseek-ai/dsh-commands';
import { App } from '../ui/App.js';
import { SessionController } from './session-controller.js';
import { parseShellCommand, runShell } from '../utils/shell.js';
/** Stable Cordis plugin name. */
export const name = 'kiro-runtime';
/** Core services required before the TUI can mount. */
export const inject = ['kiroStartup', 'agents', 'agentDefaultModel', 'sessions', 'commands'];
/** Mount the Ink render loop. */
export function apply(ctx) {
    const startup = ctx.get('kiroStartup');
    if (startup === undefined) {
        throw new Error('kiro-runtime: the launcher must provide ctx.kiroStartup before the tree mounts');
    }
    // Resolve the controlled agent asynchronously after the loader settles so
    // sibling plugins (commands, agents, steering) finish mounting.
    void mount(ctx, startup).catch((error) => {
        process.stderr.write(`dsh-kiro: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
    });
}
async function mount(ctx, startup) {
    await ctx.get('loader')?.await();
    const agents = ctx.get('agents');
    const defaultModel = ctx.get('agentDefaultModel');
    const sessions = ctx.get('sessions');
    const commands = ctx.get('commands');
    if (agents === undefined || defaultModel === undefined || sessions === undefined) {
        process.stderr.write('dsh-kiro: required services are not available (agents / agentDefaultModel / sessions)\n');
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
        },
    });
    const controller = new SessionController();
    controller.bindAgent(ctx, agent);
    controller.patchAgent({
        activeAgent: startup.agent,
        activeModel: startup.model ?? `${selection.provider}/${selection.model}`,
        activeProvider: selection.provider,
        contextLimitTokens: 128_000,
    });
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
    await sessions.flush(agent.session);
    void commands; // referenced via ctx; keep the binding for type narrowing.
}
//# sourceMappingURL=index.js.map