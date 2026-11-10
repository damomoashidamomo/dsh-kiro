/**
 * Apply a custom-agent preset to the LIVE session — the shared core behind
 * `/agent swap` AND boot-time `--agent` / `set-default` activation.
 *
 * Everything resolves through the agent-scope ctx services (same receiver
 * rules the swap path always used). Persona delivery is engine-aware:
 * kiro-loop folds it into the system prompt, the DSH engine has no per-session
 * system-prompt channel so it rides `opts.injectTurn` (a real instruction turn
 * the model acknowledges).
 *
 * @module @damomoashidamomo/dsh-kiro/utils/agent-apply
 */
/** Agent-scope service lookup (cordis receiver rules). */
function svc(ctx, name) {
    const scope = ctx;
    const get = scope?.get;
    return typeof get === 'function' ? get.call(ctx, name) : undefined;
}
/**
 * Apply the preset. Returns the human-readable "applied" lines for the swap /
 * boot confirmation message. Best-effort: a missing service skips that facet.
 */
export async function applyAgentPreset(ctx, name, preset, opts = {}) {
    const applied = [];
    const switcher = svc(ctx, 'kiroModelSwitch');
    const effort = svc(ctx, 'kiroEffortControl');
    // kiro's own template writes `"model": null` — null means "inherit current".
    const modelSpec = typeof preset.model === 'string' && preset.model.trim() !== '' ? preset.model : undefined;
    const full = modelSpec === undefined
        ? undefined
        : `${preset.provider ?? (modelSpec.includes('/') ? modelSpec.split('/')[0] : undefined)}/${modelSpec.includes('/') ? modelSpec.split('/')[1] : modelSpec}`;
    if (full !== undefined && switcher?.apply !== undefined) {
        const [provider, model] = full.split('/');
        switcher.apply({ provider, model });
        applied.push(`模型 → ${full}`);
    }
    if (typeof preset.effort === 'string' && preset.effort !== '' && effort?.setManual !== undefined) {
        effort.setManual(preset.effort);
        applied.push(`档位 → ${preset.effort}`);
    }
    // Persona + tools ride the persona service (kiro-loop system prompt +
    // schema filter); allowedTools become session trust.
    const directSet = globalThis.__kiroPersonaSet;
    const personaSvc = directSet !== undefined
        ? { set: directSet }
        : svc(ctx, 'kiroPersona');
    personaSvc?.set?.({
        name,
        ...(typeof preset.prompt === 'string' && preset.prompt.trim() !== '' ? { prompt: preset.prompt } : {}),
        ...(Array.isArray(preset.tools) ? { tools: preset.tools.filter((t) => typeof t === 'string') } : {}),
    });
    // Keep the ACTIVE-AGENT state in sync (status bar bracket, /agent list's
    // ◀ 当前, /agent menu title all read this). Without this patch the label
    // stayed at whatever boot set — swap worked but nothing admitted it.
    const controller = svc(ctx, 'kiroController');
    controller?.patchAgent?.({ activeAgent: name });
    const hasPrompt = typeof preset.prompt === 'string' && preset.prompt.trim() !== '';
    if (hasPrompt)
        applied.push('人格提示 → 已装载');
    if (Array.isArray(preset.allowedTools) && preset.allowedTools.length > 0) {
        const controllerSvc = svc(ctx, 'kiroController');
        for (const tool of preset.allowedTools) {
            if (typeof tool === 'string' && tool !== '')
                controllerSvc?.allowToolForSession?.(tool);
        }
        applied.push(`免审批 → ${preset.allowedTools.length} 个工具（本会话）`);
    }
    // Preset-declared engine rides the whole-unit switch. Decided BEFORE the
    // persona delivery note, because the delivery channel depends on it.
    const wantsKiro = preset.engine === 'kiro' || preset.engine === 'dsh';
    if (wantsKiro) {
        const engineSvc = svc(ctx, 'kiroEngineSwitch');
        if (engineSvc?.set !== undefined) {
            const unit = preset.engine;
            const rust = preset.toolEngine === 'rust' && unit === 'kiro';
            const message = await engineSvc.set(unit, { rust });
            applied.push(`引擎 → ${unit}${rust ? ' + Rust 工具引擎（Landlock）' : ''}${message !== '' ? `（${message}）` : ''}`);
        }
        else {
            applied.push(`引擎 → 未切换（引擎服务不可用）`);
        }
    }
    // Persona DELIVERY: kiro-loop already folded the prompt into its system
    // prompt; the DSH engine has no per-session system-prompt channel, so the
    // persona rides a one-shot instruction turn the model answers.
    if (hasPrompt) {
        const loopMode = globalThis.__kiroLoopMode?.() ?? 'dsh';
        if (loopMode === 'kiro') {
            applied.push('人格提示 → 系统提示已注入（kiro 引擎）');
        }
        else {
            // dsh engine: the persona rides the NEXT turn's inbox (queued, no wake).
            // A detached-submit instruction turn here made the platform stream bus
            // double-emit deltas on the FOLLOWING turns (transcript rendered
            // doubled), so it is deliberately not used.
            const injection = [
                '【会话指令】从现在起按以下人设工作，直到我另行通知：',
                '',
                preset.prompt,
                '',
                '（本条为系统装载的人设，无需确认。）',
            ].join('\n');
            const inject = globalThis.__kiroAgentInject;
            if (inject !== undefined) {
                inject(injection);
                applied.push('人格提示 → 已注入下回合上下文（dsh 引擎，随下次提问生效）');
            }
            else if (opts.injectTurn !== undefined) {
                opts.injectTurn(injection);
                applied.push('人格提示 → 已作为会话指令发送（dsh 引擎）');
            }
            else {
                applied.push('人格提示 → 未生效（无注入通道），可用 /engine kiro 后重试 swap');
            }
        }
    }
    return applied;
}
//# sourceMappingURL=agent-apply.js.map