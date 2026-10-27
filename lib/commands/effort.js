const EFFORTS = ['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
function isEffort(value) {
    return EFFORTS.includes(value);
}
function servicesOf(agentCtx) {
    const ctx = agentCtx.ctx;
    if (ctx === undefined || ctx === null)
        return undefined;
    const get = ctx.get;
    if (typeof get !== 'function')
        return undefined;
    const controller = get.call(ctx, 'kiroController');
    const provider = controller?.getState?.().agent.activeProvider;
    const model = controller?.getState?.().agent.activeModel;
    // Declared efforts come from the llm-pi-ai settings catalog: only models
    // whose entry declares reasoningEfforts accept an effort at all.
    let declared;
    try {
        const settings = get.call(ctx, 'settings');
        const piAi = settings?.get?.('llm-pi-ai');
        const entry = piAi?.providers?.[provider ?? '']?.models?.find((m) => m.id === model);
        if (entry?.reasoningEfforts !== undefined && typeof entry.reasoningEfforts === 'object') {
            declared = Object.keys(entry.reasoningEfforts);
        }
    }
    catch {
        declared = undefined;
    }
    const switcher = get.call(ctx, 'kiroModelSwitch');
    const effortControl = get.call(ctx, 'kiroEffortControl');
    const defaultModel = get.call(ctx, 'agentDefaultModel');
    return {
        provider,
        model,
        declared,
        current: effortControl?.current?.(),
        apply: (level) => {
            switcher?.apply?.({ provider, model, reasoningEffort: level });
            effortControl?.setManual?.(level);
        },
        clearManual: () => {
            effortControl?.clearManual?.();
        },
        persist: (level) => {
            void defaultModel?.saveSelection?.({ provider, model, reasoningEffort: level });
        },
    };
}
/**
 * `/effort` — set the reasoning depth the agent loop sends with every
 * request. Real wiring: persists through agentDefaultModel (survives
 * restarts) and live-applies through the same model-selection override
 * /model uses (next request). Levels are validated against the model's
 * DECLARED efforts — models without declarations report honestly instead
 * of accepting a dial they cannot turn.
 */
export const effortCommand = {
    name: 'effort',
    description: 'Set reasoning depth for this model: off | low | medium | high | xhigh | max',
    input: { hint: '<level>' },
    handler: async ({ agent, rawInput }) => {
        const candidate = rawInput.trim().toLowerCase();
        const services = servicesOf(agent);
        if (candidate === '') {
            const lines = [`usage: /effort <${EFFORTS.join('|')}>`];
            if (services?.declared !== undefined) {
                lines.push(`当前模型 ${services.provider}/${services.model} 声明档位：${services.declared.join(' / ')}`);
            }
            else {
                lines.push('当前模型未声明思考档位（settings 目录 reasoningEfforts）。');
            }
            lines.push('提示词里写「深入分析」「ultrathink」等短语也会按回合自动升档。');
            return { kind: 'success', text: lines.join('\n') };
        }
        // 'auto' = keyword-escalation mode: clear the manual pin. It is a TUI
        // dispatch mode, not a wire level — nothing is sent to the model.
        if (candidate === 'auto') {
            services?.clearManual?.();
            return { kind: 'success', text: '已回到自动模式：默认 low 基线，提示词关键词按回合升档。' };
        }
        if (services === undefined || services.provider === undefined || services.model === undefined) {
            return { kind: 'error', text: '/effort: 无法确定当前模型' };
        }
        if (services.declared === undefined) {
            return {
                kind: 'error',
                text: `${services.provider}/${services.model} 未声明思考档位（settings 目录缺 reasoningEfforts），effort 不可用。`,
            };
        }
        if (!services.declared.includes(candidate)) {
            return {
                kind: 'error',
                text: `${services.model} 支持的档位：${services.declared.join(' / ')}（不含 ${candidate}）。`,
            };
        }
        services.apply(candidate);
        services.persist(candidate);
        return {
            kind: 'success',
            text: `思考档位已设为 ${candidate}（下一轮请求生效，重启后保持）。`,
        };
    },
};
//# sourceMappingURL=effort.js.map