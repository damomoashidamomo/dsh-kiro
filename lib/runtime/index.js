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
import { createApprovalAnswerer } from "./approval-answerer.js";
import { createQuestionAnswerer } from "./question-answerer.js";
import { GUARDRAIL_TEXT } from "../guardrail/index.js";
import { routeTurnInput } from "./turn-input.js";
import { detectEffortHint, resolveAutoEffort } from "./effort-keywords.js";
import { KiroLoopDriver, readSidecarEvents } from "./kiro-loop.js";
import { registerLoopTools } from "./loop-tools.js";
import { composeSteeringPrompt } from "../steering/index.js";
import { contextWindowOf } from "./model-catalog.js";
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar';
import { parseShellCommand, runShell } from "../utils/shell.js";
import { KIRO_KNOWLEDGE, renderKnowledgeContext } from "../knowledge/index.js";
import { filterSessions, listSessions } from "../utils/sessions.js";
/** Stable Cordis plugin name. */
export const name = 'kiro-runtime';
/**
 * Declaring the app services in `inject` makes Cordis withhold this plugin's
 * `apply` until every one of them exists, which is the only reliable ordering
 * signal: `ctx.inject(['loader'], …)` fires as soon as the Loader itself
 * exists — long before the bundle patches have created the dsh-base rows.
 */
export const inject = ['kiroStartup', 'agents', 'agentDefaultModel', 'sessions', 'commands', 'llm', 'tools'];
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
    // The controller is created BEFORE the agent so the agent-scoped listeners
    // registered in `setup` can drive its approval panel immediately.
    const controller = new SessionController();
    // Model selection + reasoning-effort state live in mount scope so both
    // the agent-scoped setup and the TUI submit path share one source.
    const selected = { current: selection, assembled: undefined };
    let agentCtxRef;
    // Reasoning-effort control (habits analysis B-plan): /effort sets a
    // manual level (persisted via agentDefaultModel); prompts with
    // escalation keywords auto-raise for THAT turn unless the user pinned
    // a manual level. Models whose settings entry declares no
    // reasoningEfforts are skipped gracefully — the dial does not exist
    // for them.
    const effortControl = {
        manual: undefined,
        lastAuto: undefined,
        capabilityWarned: new Set(),
        declaredLevels(providerName, modelId) {
            try {
                const settings = ctx.get('settings');
                const piAi = settings?.get?.('llm-pi-ai');
                const entry = piAi?.providers?.[providerName]?.models?.find((m) => m.id === modelId);
                if (entry?.reasoningEfforts !== undefined && typeof entry.reasoningEfforts === 'object') {
                    return Object.keys(entry.reasoningEfforts);
                }
            }
            catch {
                // settings unavailable: treat as undeclared
            }
            return undefined;
        },
        setManual(level) {
            this.manual = level;
            this.lastAuto = undefined;
        },
        current() {
            return this.manual ?? this.lastAuto;
        },
    };
    // The live agent behind the TUI. Session switching (/chat resume, /chat new)
    // swaps it WITHOUT unmounting Ink — every closure below reads the ref so
    // submissions, cancels, flushes, and steering always target the CURRENT agent.
    const agentRef = { current: undefined };
    let agentHandle;
    const agentOptions = {
        provider: startup.model !== undefined ? startup.model.split('/')[0] ?? selection.provider : selection.provider,
        model: startup.model !== undefined ? startup.model.split('/')[1] ?? selection.model : selection.model,
    };
    /**
     * Agent-scoped wiring shared by create AND resume: approval answerer, plan
     * review, model/effort services. Defined once so a switched-to session gets
     * the exact same world.
     */
    // Agent-independent services, provided ONCE at the runtime scope: setup
    // runs again on every session switch, and re-providing would throw
    // "already registered". All of these reach the CURRENT agent via agentRef.
    ctx.provide('kiroEffortControl', effortControl);
    ctx.provide('kiroInterrupt', {
        cancel() {
            loopDriver.cancel();
            try {
                agentRef.current?.cancel({ kind: 'user' });
            }
            catch {
                // already idle or already cancelled — no-op
            }
        },
    });
    ctx.provide('kiroModelSwitch', {
        apply(next) {
            selected.current = next;
        },
    });
    const setupAgent = (agentCtx) => {
        agentCtxRef = agentCtx;
        installModelSelection(agentCtx, selected);
        // kiro-style tool-permission panel: answer the platform's
        // `approval/request` waterfall (dsh-user-approval). Registered on the
        // agent scope so only this agent's questions reach the TUI. The event's
        // cordis type augmentation ships with dsh-user-approval, which this
        // bundle does not type-depend on — hence the structural cast.
        const onApprovalRequest = agentCtx.on;
        onApprovalRequest('approval/request', async (req) => {
            return createApprovalAnswerer(controller, {
                inject: (text) => {
                    agentRef.current?.inject(createUserMessage({
                        content: [{ type: 'text', text }],
                        source: { kind: 'user' },
                    }));
                },
            })(req);
        });
        // kiro-style plan review: answer the platform's `user-questions/request`
        // waterfall (dsh-user-questions) so `exit_plan_mode` (dsh-plan-mode) can
        // put its review to the human instead of failing with NO_PROVIDER.
        // Agent-scoped like the approval answerer; this bundle DOES depend on
        // dsh-user-questions, so the typed augmentation applies.
        agentCtx.on('user-questions/request', createQuestionAnswerer(controller));
    };
    // --resume-id <id> resumes that persisted session; bare --resume picks the
    // most recent one for this cwd. agents.resume loads the persisted log so
    // the model continues with full history; the transcript is replayed after
    // bind via sessionQuery.readSession.
    const bootResumeId = startup.resumeId !== undefined
        ? startup.resumeId
        : startup.resume === true
            ? filterSessions(listSessions(), { cwd: process.cwd() }).at(0)?.id
            : undefined;
    if (bootResumeId !== undefined) {
        agentHandle = await agents.resume({
            resumeSessionId: brandString(bootResumeId),
            agentOptions,
            setup: setupAgent,
        });
    }
    else {
        agentHandle = await agents.create({ sessionId, meta: { cwd: process.cwd() }, agentOptions, setup: setupAgent });
    }
    agentRef.current = agentHandle.agent;
    const agent = agentHandle.agent;
    /**
     * Replay a persisted session's events into the transcript (resume). The
     * tail is kept (300 events) — the transcript is a viewport, not an archive.
     */
    const seedHistory = async (id) => {
        try {
            const query = ctx.get?.('sessionQuery');
            if (query?.readSession === undefined)
                return 0;
            const snapshot = await query.readSession(brandString(id));
            const events = (snapshot.events ?? []);
            // A3: kiro-loop turns live in the workspace sidecar (the platform log
            // only carries the platform loop's events) — merge them in so resume
            // replays BOTH drivers' turns.
            const sidecar = readSidecarEvents(process.cwd());
            const merged = [...events, ...sidecar];
            controller.replayEvents(merged.slice(-300));
            return merged.length;
        }
        catch {
            return 0;
        }
    };
    controller.bindAgent(ctx, agent);
    // activeModel is the bare model id (slice after the first slash, matching
    // /model's parseModel); StatusBar renders provider/model once.
    const bootModel = startup.model ?? `${selection.provider}/${selection.model}`;
    const bootModelId = bootModel.includes('/') ? bootModel.slice(bootModel.indexOf('/') + 1) : bootModel;
    // Read the model catalog for the boot model's declared context window.
    const settingsCtx = ctx;
    const piAiBoot = typeof settingsCtx.get === 'function'
        ? settingsCtx.get('settings')
        : undefined;
    const piAi = piAiBoot?.get !== undefined ? piAiBoot.get('llm-pi-ai') : undefined;
    const bootModelWindow = contextWindowOf(piAi, selection.provider, bootModelId);
    controller.patchAgent({
        activeAgent: startup.agent,
        activeModel: bootModelId,
        activeProvider: selection.provider,
        // The catalog's declared window for the BOOT model — no invented
        // default: models without a contextWindow show bare token usage.
        contextLimitTokens: bootModelWindow ?? undefined,
    });
    // The settings catalog only lists a window when the user annotated the
    // model (`contextWindow:` in llm-pi-ai). Pi-ai can still resolve one from a
    // provider/request default, and the request declares it — ask the adapter
    // so the prompt's usage gutter (`0% >`) is there from the first frame
    // instead of only after the first turn.
    const llmSvc = ctx.get?.('llm');
    const resolveModelInfo = llmSvc?.resolveModelInfo;
    if (llmSvc !== undefined && typeof resolveModelInfo === 'function') {
        // `call(llmSvc, …)`: the service reached through the context proxy would
        // otherwise run detached from its receiver.
        void resolveModelInfo
            .call(llmSvc, selection.provider, bootModelId)
            .then((info) => {
            const window = info?.context?.contextWindow;
            if (window !== undefined && window > 0)
                controller.patchAgent({ contextLimitTokens: window });
        })
            .catch(() => {
            // Adapter without model metadata (or an unregistered provider): the
            // contextPressure projection still delivers the window on the first
            // request, and without either the gutter falls back to `> `.
        });
    }
    // Transcript replay must run AFTER bindAgent (bind resets state).
    if (bootResumeId !== undefined)
        await seedHistory(bootResumeId);
    // Expose the controller as a Cordis service so slash commands can update
    // the status bar (e.g. /model <provider>/<model> after persisting the new
    // selection) without needing a back-reference to this closure.
    ctx.provide('kiroController', controller);
    // kiro-loop: dsh-kiro's own turn driver, selectable per session with
    // /loop kiro|dsh. Text-only for now; the platform ctx.tools seam verified
    // by the P0 probe lands in P2/P3 behind the same driver.
    // A1/A2: the kiro-loop approval gate — the same answerer the platform
    // waterfall reaches, called directly so both tool engines are gated.
    const loopApprovalGate = createApprovalAnswerer(controller, {
        inject: (text) => { controller.pushSystem(text); },
    });
    const loopDriver = new KiroLoopDriver({
        ctx,
        controller: { ingestEvent: (event) => controller.ingestEvent(event) },
        systemPrompt: () => {
            const steering = ctx.get?.('kiroSteering');
            const steeringText = composeSteeringPrompt(steering?.applicable ?? []);
            const persona = personaRef.current;
            const personaPrompt = persona?.prompt !== undefined && persona.prompt.trim() !== ''
                ? ['', `## 当前智能体预设：${persona.name ?? 'custom'}`, persona.prompt.trim()]
                : [];
            return [
                'You are a coding agent running inside the Kiro TUI for DeepSeek Harness.',
                `Your working directory is ${process.cwd()}.`,
                ...personaPrompt,
                '', GUARDRAIL_TEXT,
                ...(steeringText !== '' ? ['', steeringText] : []),
            ].join('\n');
        },
        selection: () => ({
            provider: selected.current?.provider ?? 'deepseek',
            model: selected.current?.model ?? 'deepseek-chat',
            reasoningEffort: effortControl.current(),
        }),
        agent: () => agentRef.current,
        agentCtx: () => agentCtxRef,
        persona: () => personaRef.current,
        approvalGate: (req) => loopApprovalGate({ toolName: req.toolName, reason: 'kiro-loop 工具执行确认', signal: req.signal }),
        permissionPreset: () => controller.getState().agent.permissionPreset,
        contextWindow: () => {
            const provider = selected.current?.provider;
            const model = selected.current?.model;
            if (provider === undefined || model === undefined)
                return undefined;
            try {
                const settingsCtx = ctx;
                const piAi = settingsCtx.get?.('settings');
                return contextWindowOf(piAi?.get?.('llm-pi-ai'), provider, model);
            }
            catch {
                return undefined;
            }
        },
    });
    let loopMode = 'dsh';
    if (startup.engine === 'kiro') {
        // Boot-time whole-unit switch (--engine kiro): applied after the driver
        // and services exist — see the post-mount block below.
    }
    // P3: kiro-loop owned tools (todo checklist + thinking scratchpad), wired
    // straight into the controller so BOTH loops get the kiro-cli tool surface.
    const disposeLoopTools = registerLoopTools(ctx, {
        controller: { ingestEvent: (event) => controller.ingestEvent(event) },
    });
    ctx.on('dispose', (() => disposeLoopTools()));
    // C1: auto-checkpoint after each turn end (both drivers — the kiro-loop
    // emits the same synthetic turn/end). Only when the shadow repo is inited.
    controller.turnEndHook = () => {
        try {
            const cp = globalThis.__kiroCheckpointManager;
            if (cp?.isInitialized?.() === true) {
                cp.snapshot?.('auto: turn end');
            }
        }
        catch {
            // checkpoint optional — never break the turn
        }
    };
    // Agent-parity persona state: /agent swap writes prompt/tools/allowedTools;
    // the kiro-loop reads it per request (system prompt + schema filter).
    const personaRef = { current: undefined };
    ctx.provide('kiroPersona', {
        get: () => personaRef.current,
        set(next) {
            personaRef.current = next;
        },
    });
    globalThis.__kiroPersonaSet =
        (next) => { personaRef.current = next; };
    // Option-menu data bridges (agent presets + recent sessions).
    {
        const agentMod = await import("../commands/agent.js");
        globalThis.__kiroAgentList =
            () => agentMod.agentListBridge();
        const chatMod = await import("../commands/chat.js");
        globalThis.__kiroChatList = () => chatMod.chatListBridge();
        globalThis.__kiroChatTitles = (ids) => chatMod.chatTitlesBridge(ctx, ids);
    }
    // Controller-state bridge for menu titles (current agent/engine).
    ;
    globalThis.__kiroControllerState =
        () => controller.getState();
    ctx.provide('kiroLoopTrace', {
        recent: () => loopDriver.trace(),
    });
    ctx.provide('kiroEngineSwitch', {
        /** One-shot whole-unit switch: loop + tool engine together. */
        async set(unit, opts) {
            const rust = opts?.rust ?? unit === 'kiro';
            if (unit === 'kiro') {
                const modeMsg = ctx.get?.('kiroLoopMode');
                const switchMsg = modeMsg?.set?.('kiro') ?? '';
                loopDriver.seed(controller.getState().messages.map((m) => ({ kind: m.kind, text: m.text })));
                let engineNote = '';
                if (rust && loopDriver.engineAvailable()) {
                    loopDriver.engine = 'rust';
                    loopDriver.workspaceRoot = process.cwd();
                    engineNote = ' + Rust 工具引擎（Landlock）';
                }
                else {
                    loopDriver.engine = 'dsh';
                    engineNote = ' + 平台工具管线';
                }
                controller.patchAgent({ loopDriver: 'kiro', toolEngine: loopDriver.engine });
                return `${switchMsg}${engineNote}`;
            }
            const modeSvc = ctx.get?.('kiroLoopMode');
            const back = modeSvc?.set?.('dsh') ?? '已切换回 DSH 平台 loop。';
            loopDriver.engine = 'dsh';
            controller.patchAgent({ loopDriver: 'dsh', toolEngine: 'dsh' });
            return back;
        },
    });
    if (startup.engine !== undefined) {
        const svc = { set: async (unit, opts) => {
                const engineSvc = ctx.get?.('kiroEngineSwitch');
                return engineSvc?.set?.(unit, opts) ?? '';
            } };
        void svc.set(startup.engine, { rust: startup.engine === 'kiro' }).then((msg) => { if (msg !== '')
            controller.pushSystem(`◇ ${msg}`); });
    }
    ctx.provide('kiroToolEngine', {
        get() { return loopDriver.engine; },
        set(next) {
            if (next === 'rust' && !loopDriver.engineAvailable()) {
                return 'Rust 引擎未构建：先在仓库执行 pnpm build:engine（engine/target/release/kiro-toold）。';
            }
            loopDriver.engine = next;
            loopDriver.workspaceRoot = process.cwd();
            return next === 'rust'
                ? '工具引擎已切到 Rust（Landlock 沙箱，bash/read/write 走引擎，其余走平台）。'
                : '工具引擎已切回 DSH 平台管线。';
        },
        available() { return loopDriver.engineAvailable(); },
    });
    ctx.provide('kiroLoopMode', {
        get() { return loopMode; },
        set(next) {
            if (next === loopMode)
                return `当前已是 ${next} loop。`;
            loopMode = next;
            if (next === 'kiro') {
                // Continue the conversation: seed the driver from the transcript.
                loopDriver.seed(controller.getState().messages.map((m) => ({ kind: m.kind, text: m.text })));
            }
            return next === 'kiro'
                ? '已切换到 kiro-loop（dsh-kiro 自研驱动，完整工具循环）。'
                : '已切换回 DSH 平台 loop。';
        },
    });
    // Bridge to sessionQuery.readSession for slash commands: calling the
    // engine through an agent-scoped ctx.get goes through a cordis shadow
    // proxy that swaps `this`, so the engine's private fields vanish
    // (TypeError reading '_corpus'). The service captured HERE — the runtime
    // mount scope — calls with the right receiver.
    const sessionQueryService = ctx.get?.('sessionQuery');
    // /retry: resubmit the last user prompt after a failed turn (B-9). The
    // command reads the transcript's last user message and calls submit —
    // the same path as a fresh keystroke, so steering/escalation all apply.
    // /effort probe bridge: calling ctx.llm.stream through an agent-scope
    // ctx.get hits the cordis shadow proxy (receiver lost — the same trap as
    // sessionQuery.readSession). The runtime-scope capture calls cleanly.
    ctx.provide('kiroEffortProbe', {
        async probe(provider, model) {
            const llm = ctx.llm;
            const runtime = llm;
            if (runtime === undefined || typeof runtime.stream !== 'function')
                return '/effort probe: llm 服务不可用';
            const attempt = async (effort) => {
                const options = {
                    provider,
                    model,
                    system: 'probe',
                    maxTokens: 16,
                    messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
                    ...(effort !== undefined ? { reasoningEffort: effort } : {}),
                    signal: AbortSignal.timeout(30000),
                };
                try {
                    for await (const _chunk of runtime.stream(options))
                        break;
                    return 'ok';
                }
                catch (error) {
                    return error instanceof Error ? error.message : String(error);
                }
            };
            const baseline = await attempt(undefined);
            if (baseline !== 'ok') {
                return [`/effort probe：基线请求就失败了（未带档位字段）——先解决模型可达性：`, `  ${baseline.slice(0, 160)}`].join('\n');
            }
            const withEffort = await attempt('low');
            if (withEffort === 'ok') {
                return '/effort probe: ok';
            }
            return `/effort probe: rejected: ${withEffort.slice(0, 160)}`;
        },
    });
    ctx.provide('kiroRetry', {
        lastUserPrompt() {
            for (let i = controller.state.messages.length - 1; i >= 0; i -= 1) {
                const m = controller.state.messages[i];
                if (m?.kind === 'user' && m.text.trim() !== '')
                    return m.text;
            }
            return undefined;
        },
        submit(text) {
            submit(text);
        },
    });
    ctx.provide('kiroSessionReader', {
        readSession: (id) => sessionQueryService?.readSession?.(brandString(id)),
    });
    // In-TUI session switching (/chat resume <id>, /chat new): swap the live
    // agent without unmounting Ink. flush + dispose the old agent, resume (or
    // create) through the registry with the SAME setup, rebind, replay history.
    ctx.provide('kiroSessionSwitch', {
        async switchTo(target) {
            try {
                const current = agentRef.current;
                if (current !== undefined) {
                    try {
                        await sessions.flush(current.session);
                    }
                    catch {
                        // Best-effort: switching must not strand the user on a flush bug.
                    }
                }
                controller.unbind();
                try {
                    await agentHandle?.dispose();
                }
                catch {
                    // Best-effort teardown; the registry refuses double-dispose.
                }
                agentHandle = target === undefined
                    ? await agents.create({
                        sessionId: brandString(`session-${randomUUID()}`),
                        meta: { cwd: process.cwd() },
                        agentOptions,
                        setup: setupAgent,
                    })
                    : await agents.resume({
                        resumeSessionId: brandString(target),
                        agentOptions,
                        setup: setupAgent,
                    });
                agentRef.current = agentHandle.agent;
                // bindAgent resets the transcript; re-apply the status-bar model facts
                // (they live in agent state, which the reset clears).
                controller.bindAgent(ctx, agentHandle.agent);
                controller.patchAgent({
                    activeAgent: startup.agent,
                    activeModel: bootModelId,
                    activeProvider: selection.provider,
                    contextLimitTokens: bootModelWindow ?? undefined,
                });
                if (target === undefined) {
                    controller.pushSystem('◇ 已开启新会话（原会话已存盘）。');
                    return { ok: true, message: '已开启新会话。' };
                }
                const total = await seedHistory(target);
                controller.pushSystem(`◇ 已恢复会话 ${target}（回放最近 ${Math.min(total, 300)}/${total} 条事件）。`);
                return { ok: true, message: `已恢复会话 ${target}。` };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                controller.pushSystem(`✗ 会话切换失败：${message}`);
                return { ok: false, message: `切换失败：${message}` };
            }
        },
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
        // Keyword escalation (B-plan): '深入分析'/'ultrathink' style phrases
        // raise the effort for THIS turn; a manual /effort wins and is never
        // overridden. Applied only when the current model declares the level.
        {
            const hinted = detectEffortHint(trimmed);
            const agentState = controller.getState().agent;
            const providerName = agentState.activeProvider;
            const modelId = agentState.activeModel;
            if (hinted !== undefined && effortControl.manual === undefined && providerName !== undefined && modelId !== undefined) {
                const declared = effortControl.declaredLevels(providerName, modelId);
                const effective = resolveAutoEffort(hinted, undefined, declared);
                if (effective !== undefined && effortControl.lastAuto !== effective) {
                    effortControl.lastAuto = effective;
                    // ReasoningEffortId is a branded string; the keyword table only
                    // produces the pi-ai level spellings, so the cast is sound.
                    selected.current = { ...selected.current, reasoningEffort: effective };
                    controller.pushSystem(`◆ 本回合思考档位：${effective}（关键词触发；/effort <level> 可固定）`);
                }
                else if (declared !== undefined && !effortControl.capabilityWarned.has(modelId)) {
                    effortControl.capabilityWarned.add(modelId);
                    controller.pushSystem(`ℹ ${modelId} 未声明思考档位，关键词升档对本模型不生效。`);
                }
            }
        }
        const knowledge = ctx.get(KIRO_KNOWLEDGE);
        if (knowledge !== undefined && knowledge.size() > 0) {
            // RAG: inject the top BM25 hits as model-facing context (does not wake
            // the driver and is not rendered into the transcript).
            const hits = knowledge.query(trimmed, 2);
            const block = renderKnowledgeContext(hits);
            if (block !== '') {
                agentRef.current?.inject(createUserMessage({
                    content: [{ type: 'text', text: block }],
                    source: { kind: 'plugin', plugin: 'kiro-knowledge' },
                }));
            }
        }
        // kiro-loop mode: the turn runs through our own driver (P1 text-only).
        if (loopMode === 'kiro') {
            if (loopDriver.busy) {
                const preview = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
                controller.noteSteered(trimmed);
                controller.pushSystem(`↪ 已插话（下一步生效）：${preview}`);
                loopDriver.steer(trimmed);
                return;
            }
            void loopDriver.runTurn(trimmed);
            return;
        }
        const message = createUserMessage({
            content: [{ type: 'text', text: trimmed }],
            source: { kind: 'user' },
        });
        // A running turn turns this submission into mid-flight steering — the
        // live turn's next step boundary consumes it (kiro-style interjection,
        // no cancel needed). Idle (or cancelling — platform rule: input after an
        // active cancellation queues for the next turn) opens/queues a new turn.
        const live = agentRef.current;
        if (live !== undefined && routeTurnInput(live, message) === 'steer') {
            const preview = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
            controller.noteSteered(trimmed);
            controller.pushSystem(`↪ 已插话（下一步生效）：${preview}`);
        }
    };
    // Non-TTY mode: process the task and exit without booting Ink.
    if (startup.noInteractive === true) {
        if (startup.task === undefined) {
            process.stderr.write('dsh-kiro: --no-interactive requires a positional task\n');
            process.exit(2);
        }
        submit(startup.task);
        await agentRef.current?.whenIdle();
        process.exit(0);
        return;
    }
    // @-mention search: the platform's fileReferences service (loaded by the
    // file-reference-local patch row) walks the workspace with sensible
    // excludes; candidates map into the TUI autocomplete items.
    // The base service type lacks `list` (it ships with the local provider);
    // narrow to the local class the file-reference-local patch row mounts.
    const fileRefs = ctx.get('fileReferences');
    const fileSearch = fileRefs?.list !== undefined
        ? (query) => {
            const timeout = new AbortController();
            const timer = setTimeout(() => { timeout.abort(); }, 4000);
            return fileRefs.list(agent, query, timeout.signal)
                .then((candidates) => candidates.map((candidate) => ({
                insert: formatFileMention(candidate, false) ?? `${candidate.path} `,
                label: candidate.kind === 'directory' ? `${candidate.path}/` : candidate.path,
                hint: candidate.kind === 'directory' ? 'dir' : undefined,
            })))
                .finally(() => { clearTimeout(timer); });
        }
        : undefined;
    const app = render(_jsx(App, { controller: controller, seedTask: startup.task, activeAgentName: startup.agent, onSubmit: submit, fileSearch: fileSearch }), { exitOnCtrlC: false, patchConsole: false });
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
        const exitSession = agentRef.current?.session;
        if (exitSession !== undefined) {
            void sessions.flush(exitSession).catch((error) => {
                ctx.logger('kiro-runtime').warn('session flush failed: %s', String(error));
            });
        }
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