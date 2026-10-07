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
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { matchesMatcher, runHook, mergeHookOutputs, appendHookInvoked, appendHookResult, createDetachedRuns, DEFAULT_HOOK_TIMEOUT_MS, DEFAULT_STDERR_SUMMARY_MAX_CHARS, } from '@deepseek-ai/dsh-hook-protocol';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
const POINTS = [
    'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop',
];
export const KIRO_HOOKS = 'kiroHooks';
/** Module-level handle so /hooks (whose handlers get no ctx) can read state. */
let activeService;
export function getKiroHooks() {
    return activeService;
}
export const name = 'kiro-hooks';
export const inject = ['shell', 'sessionProjections'];
/** Parse one config file into per-point matcher groups; command hooks only. */
function parseHookFile(raw) {
    const groups = {};
    let skipped = 0;
    const file = (raw ?? {});
    const hooks = file.hooks;
    if (hooks === null || typeof hooks !== 'object')
        return { groups, skipped };
    for (const point of POINTS) {
        const listed = hooks[point];
        if (!Array.isArray(listed))
            continue;
        const parsedGroups = [];
        for (const group of listed) {
            if (group === null || typeof group !== 'object')
                continue;
            const matcher = typeof group.matcher === 'string'
                ? group.matcher
                : undefined;
            const rawHooks = group.hooks;
            if (!Array.isArray(rawHooks))
                continue;
            const commandHooks = rawHooks.filter((h) => h !== null && typeof h === 'object' && h.type === 'command'
                && typeof h.command === 'string');
            skipped += rawHooks.length - commandHooks.length;
            if (commandHooks.length === 0)
                continue;
            parsedGroups.push({
                matcher,
                hooks: commandHooks.map((h) => ({
                    command: h.command,
                    ...(typeof h.timeout === 'number' ? { timeoutSec: h.timeout } : {}),
                })),
            });
        }
        if (parsedGroups.length > 0)
            groups[point] = parsedGroups;
    }
    return { groups, skipped };
}
/** Read one JSON file, reporting load failures as a source row. */
function loadSource(path) {
    try {
        return { loaded: true, parsed: JSON.parse(readFileSync(path, 'utf8')) };
    }
    catch (error) {
        const code = error?.code;
        if (code === 'ENOENT')
            return { loaded: false, reason: 'not found' };
        return { loaded: false, reason: error instanceof Error ? error.message : String(error) };
    }
}
export function apply(ctx) {
    const workspaceDir = process.cwd();
    const sources = [];
    const entries = [];
    const recentRuns = [];
    const RECENT_LIMIT = 50;
    // User-level config first, then workspace-level (both run; user first).
    const discovered = [
        { path: join(homedir(), '.kiro', 'hooks.json'), source: 'user' },
        { path: join(workspaceDir, '.kiro', 'hooks.json'), source: 'workspace' },
    ];
    /**
     * (Re-)discover and parse both config files, REPLACING the live tables in
     * place: interception handlers close over `merged`, so a reload swaps the
     * behaviour without re-registering anything (hot reload, /hooks reload).
     */
    const reload = () => {
        sources.length = 0;
        entries.length = 0;
        for (const key of Object.keys(merged))
            delete merged[key];
        for (const file of discovered) {
            const result = loadSource(file.path);
            sources.push({ path: file.path, loaded: result.loaded, ...(result.reason !== undefined ? { reason: result.reason } : {}) });
            if (!result.loaded || result.parsed === undefined)
                continue;
            const { groups, skipped } = parseHookFile(result.parsed);
            if (skipped > 0) {
                ctx.logger.warn(`kiro-hooks: ${file.path}: skipped ${skipped} non-command hook(s) (only command hooks run)`);
            }
            for (const point of POINTS) {
                const groupsForPoint = groups[point];
                if (groupsForPoint === undefined)
                    continue;
                const existing = merged[point] ?? [];
                merged[point] = [...existing, ...groupsForPoint];
                for (const group of groupsForPoint) {
                    for (const hook of group.hooks) {
                        entries.push({ source: file.source, point, matcher: group.matcher, command: hook.command });
                    }
                }
            }
        }
        return { hooks: entries.length };
    };
    const merged = {};
    reload();
    const service = {
        sources,
        entries,
        recent: (limit = 20) => recentRuns.slice(-limit).reverse(),
        reload,
    };
    ctx.provide(KIRO_HOOKS, service);
    activeService = service;
    ctx.effect(() => () => {
        if (activeService === service)
            activeService = undefined;
    }, 'kiro-hooks: clear module handle');
    // Handlers are registered even when the initial config is empty: a
    // `/hooks reload` that adds hooks must find the wiring in place.
    const detached = createDetachedRuns();
    ctx.effect(() => () => detached.drain(), 'kiro-hooks: drain detached hook runs');
    let handlerCounter = 0;
    const nextHandlerId = (point) => `kiro:${point}:${++handlerCounter}`;
    const PLUGIN_SOURCE = { kind: 'plugin', plugin: 'kiro-hooks' };
    /** The last open turn number, or 0 without an agent (audit pairing). */
    const lastTurn = (agent) => {
        if (agent === undefined)
            return 0;
        try {
            const projections = ctx.sessionProjections;
            if (projections?.stateOf === undefined)
                return 0;
            return projections.stateOf(agent.session, 'turnBoundary').lastTurn;
        }
        catch {
            return 0;
        }
    };
    const recordRun = (record) => {
        recentRuns.push(record);
        if (recentRuns.length > RECENT_LIMIT)
            recentRuns.splice(0, recentRuns.length - RECENT_LIMIT);
    };
    /**
     * Run every configured hook for `point` whose matcher selects `matchQuery`,
     * with `payload` on stdin; append the audit pair when a turn is open.
     */
    async function runPoint(point, matchQuery, payload, opts) {
        const groups = merged[point] ?? [];
        const outputs = [];
        const workdir = opts.agent?.session?.header?.cwd;
        const hookEnv = workdir !== undefined ? { CLAUDE_PROJECT_DIR: workdir } : undefined;
        for (const group of groups) {
            if (!matchesMatcher(group.matcher, matchQuery, 'claude-code'))
                continue;
            for (const hook of group.hooks) {
                const handlerId = nextHandlerId(point);
                const session = opts.agent?.session;
                if (session !== undefined && opts.turn !== undefined) {
                    appendHookInvoked(session, {
                        turn: opts.turn,
                        point,
                        dialect: 'claude-code',
                        handlerId,
                        ...(group.matcher !== undefined ? { matcher: group.matcher } : {}),
                    });
                }
                const { output, durationMs } = await runHook(ctx.shell, hook, {
                    payload,
                    defaultTimeoutMs: DEFAULT_HOOK_TIMEOUT_MS,
                    ...(hookEnv !== undefined ? { env: hookEnv } : {}),
                    ...(workdir !== undefined && isAbsolute(workdir) ? { cwd: workdir } : {}),
                    signal: opts.signal,
                    trailingNewline: true,
                    expectedEventName: point,
                }, () => performance.now());
                outputs.push(output);
                if (session !== undefined && opts.turn !== undefined) {
                    appendHookResult(session, {
                        turn: opts.turn,
                        point,
                        handlerId,
                        output,
                        stderrSummaryMaxChars: DEFAULT_STDERR_SUMMARY_MAX_CHARS,
                        durationMs,
                    });
                }
                recordRun({
                    point,
                    matcher: group.matcher,
                    decision: output.continue === false
                        ? 'block'
                        : output.decision ?? 'pass',
                    exitCode: output.exitCode,
                    durationMs,
                });
            }
        }
        return mergeHookOutputs(outputs);
    }
    /** Build additional model context from merged output, or undefined. */
    function contextFrom(merged) {
        if (merged.additionalContext.length === 0)
            return undefined;
        return createUserMessage({
            content: merged.additionalContext.map((text) => ({ type: 'text', text })),
            source: PLUGIN_SOURCE,
        });
    }
    // --- payload builders (Claude-Code dialect, script compatible) ---
    const base = (agent, event) => ({
        session_id: agent?.session?.header?.id ?? '',
        transcript_path: '',
        cwd: agent?.session?.header?.cwd ?? workspaceDir,
        hook_event_name: event,
    });
    const blocksToText = (content) => Array.isArray(content)
        ? content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
        : '';
    ctx.on('agent/session-start', ({ agent, source }) => {
        detached.track(runPoint('SessionStart', source, { ...base(agent, 'SessionStart'), source }, { agent, signal: detached.signal })
            .then((merged) => {
            const context = contextFrom(merged);
            if (context !== undefined)
                agent.inject?.(context);
        })
            .catch((error) => {
            ctx.logger.warn(`kiro-hooks: SessionStart hook failed: ${String(error)}`);
        }));
    });
    ctx.on('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
        if (merged.UserPromptSubmit === undefined || messages.length === 0)
            return next();
        const mergedOutcome = await runPoint('UserPromptSubmit', '', {
            ...base(agent, 'UserPromptSubmit'),
            prompt: blocksToText(messages.flatMap((message) => message.content)),
        }, { agent, turn, signal });
        if (mergedOutcome.decision === 'deny')
            return { kind: 'reject' };
        const downstream = await next();
        const ours = contextFrom(mergedOutcome);
        if (ours === undefined || downstream.kind !== 'enter')
            return downstream;
        return { ...downstream, messages: [...downstream.messages ?? [], ours] };
    });
    ctx.on('tools/pre-execute', async (exec, next) => {
        if (merged.PreToolUse === undefined)
            return next();
        const turn = lastTurn(exec.agent);
        const mergedOutcome = await runPoint('PreToolUse', exec.name, {
            ...base(exec.agent, 'PreToolUse'),
            tool_name: exec.name,
            tool_input: exec.arguments,
            tool_use_id: exec.callId,
        }, { ...(exec.agent !== undefined ? { agent: exec.agent } : {}), turn, signal: exec.signal });
        if (mergedOutcome.decision === 'deny') {
            return { kind: 'deny', reason: mergedOutcome.reason ?? 'blocked by PreToolUse hook' };
        }
        if (mergedOutcome.decision === 'ask') {
            return { kind: 'ask', ...(mergedOutcome.reason !== undefined ? { reason: mergedOutcome.reason } : {}) };
        }
        return next();
    });
    ctx.on('tools/post-execute', async (exec, result, next) => {
        if (merged.PostToolUse === undefined)
            return next();
        const turn = lastTurn(exec.agent);
        const mergedOutcome = await runPoint('PostToolUse', exec.name, {
            ...base(exec.agent, 'PostToolUse'),
            tool_name: exec.name,
            tool_input: exec.arguments,
            tool_use_id: exec.callId,
            tool_response: blocksToText(result.content),
        }, { ...(exec.agent !== undefined ? { agent: exec.agent } : {}), turn, signal: exec.signal });
        const context = contextFrom(mergedOutcome);
        if (mergedOutcome.decision === 'deny') {
            return {
                kind: 'block',
                feedback: [{ type: 'text', text: mergedOutcome.reason ?? 'blocked by PostToolUse hook' }],
                ...(context !== undefined ? { additionalContexts: [context] } : {}),
            };
        }
        const downstream = await next();
        if (context === undefined)
            return downstream;
        return { ...downstream, additionalContexts: [context, ...(downstream.additionalContexts ?? [])] };
    });
    ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
        const mergedOutcome = await runPoint('Stop', '', { ...base(agent, 'Stop'), stop_hook_active: false }, { agent, turn, signal });
        if (mergedOutcome.decision === 'deny') {
            const text = mergedOutcome.reason ?? 'continue: blocked by Stop hook';
            agent.steer?.(createUserMessage({ content: [{ type: 'text', text }], source: PLUGIN_SOURCE }));
        }
    });
    ctx.on('subagent/start', (info) => {
        detached.track(runPoint('SubagentStart', 'general-purpose', {
            ...base(undefined, 'SubagentStart'),
            agent_id: info.id,
            agent_type: 'general-purpose',
        }, { signal: detached.signal })
            .catch((error) => {
            ctx.logger.warn(`kiro-hooks: SubagentStart hook failed: ${String(error)}`);
        }));
    });
    ctx.on('subagent/end', (info) => {
        detached.track(runPoint('SubagentStop', 'general-purpose', {
            ...base(undefined, 'SubagentStop'),
            agent_id: info.id,
            agent_type: 'general-purpose',
            stop_hook_active: false,
        }, { signal: detached.signal }));
    });
}
//# sourceMappingURL=index.js.map