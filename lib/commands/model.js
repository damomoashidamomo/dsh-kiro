/**
 * `/model` — pick the model the current session uses.
 *
 * Two flows:
 *
 * 1. Interactive (kiro-style): `/model` with no argument opens a list
 *    picker populated from the DSH configuration file (`llm-pi-ai.providers`
 *    in `~/.dsh/settings.yaml`). ↑/↓ selects, Enter confirms, Esc cancels.
 *
 * 2. Direct: `/model <provider>/<model>` sets the selection immediately.
 *
 * Either path persists through `agentDefaultModel.saveSelection` (writes the
 * `agent-default-model` settings scope so the next launch picks it up) and
 * updates the status bar via the runtime's `kiroController` service.
 *
 * Note: the live Agent has its initial model baked into the loop setup; a
 * mid-flight change is reflected in the status bar but the in-flight turn
 * keeps using the original model. The new model applies on the next turn.
 */
function serviceOf(ctx, name) {
    if (ctx === null || typeof ctx !== 'object')
        return undefined;
    const c = ctx.get;
    if (typeof c !== 'function')
        return undefined;
    return c.call(ctx, name);
}
function kiroControllerOf(ctx) {
    return serviceOf(ctx, 'kiroController');
}
function parseModel(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return undefined;
    const slashIdx = trimmed.indexOf('/');
    if (slashIdx <= 0 || slashIdx >= trimmed.length - 1)
        return undefined;
    const provider = trimmed.slice(0, slashIdx).trim();
    const model = trimmed.slice(slashIdx + 1).trim();
    if (provider === '' || model === '')
        return undefined;
    return { provider, model };
}
/** Build picker rows from the DSH config's `llm-pi-ai.providers` catalog. */
function buildModelItems(piAi, current) {
    const items = [];
    const seen = new Set();
    for (const [route, profile] of Object.entries(piAi?.providers ?? {})) {
        const display = profile.displayName ?? route;
        for (const model of profile.models ?? []) {
            const value = `${route}/${model.id}`;
            if (seen.has(value))
                continue;
            seen.add(value);
            items.push({
                value,
                label: `${display} · ${model.name ?? model.id}`,
                hint: `${route}/${model.id}`,
                current: current !== undefined && route === current.provider && model.id === current.model,
            });
        }
    }
    return items;
}
/** Resolve a model's catalog context window, when the config declares one. */
function contextWindowOf(piAi, provider, model) {
    return piAi?.providers?.[provider]?.models?.find((m) => m.id === model)?.contextWindow;
}
export const modelCommand = {
    name: 'model',
    description: 'Select the model the current session uses',
    input: { hint: '<provider/model> | (interactive list)' },
    handler: async ({ agent, rawInput }) => {
        const parsed = parseModel(rawInput);
        const ctx = agent.ctx;
        const settings = serviceOf(ctx, 'settings');
        const piAi = settings?.get !== undefined
            ? settings.get('llm-pi-ai')
            : undefined;
        // Interactive kiro-style picker when no argument is given.
        if (parsed === undefined) {
            const defaultModel = serviceOf(ctx, 'agentDefaultModel');
            const controller = kiroControllerOf(ctx);
            if (defaultModel?.currentSelection === undefined
                || defaultModel.saveSelection === undefined
                || settings?.get === undefined
                || controller === undefined) {
                return {
                    kind: 'error',
                    text: 'model picker: settings / agentDefaultModel / kiroController are not available',
                };
            }
            const items = buildModelItems(piAi, defaultModel.currentSelection());
            if (items.length === 0) {
                return {
                    kind: 'error',
                    text: 'no models configured — add providers to llm-pi-ai in ~/.dsh/settings.yaml',
                };
            }
            controller.openPicker({
                title: '选择模型',
                items,
                onSelect: (item) => {
                    const next = parseModel(item.value);
                    if (next === undefined)
                        return;
                    void (async () => {
                        try {
                            await defaultModel.saveSelection(next);
                            const contextLimitTokens = contextWindowOf(piAi, next.provider, next.model);
                            controller.patchAgent({
                                activeProvider: next.provider,
                                activeModel: `${next.provider}/${next.model}`,
                                ...(contextLimitTokens !== undefined ? { contextLimitTokens } : {}),
                            });
                            controller.pushSystem(`模型已切换到 ${next.provider}/${next.model}（下一轮生效）`);
                        }
                        catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            controller.pushSystem(`model switch failed: ${message}`);
                        }
                    })();
                },
            });
            return { kind: 'success' };
        }
        // Direct path: /model <provider>/<model>
        const defaultModel = serviceOf(ctx, 'agentDefaultModel');
        if (defaultModel?.saveSelection === undefined) {
            return {
                kind: 'error',
                text: 'agentDefaultModel service is not available; cannot persist the selection',
            };
        }
        try {
            await defaultModel.saveSelection(parsed);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { kind: 'error', text: `failed to persist selection: ${message}` };
        }
        const ctrl = kiroControllerOf(ctx);
        const contextLimitTokens = contextWindowOf(piAi, parsed.provider, parsed.model);
        ctrl?.patchAgent({
            activeProvider: parsed.provider,
            activeModel: `${parsed.provider}/${parsed.model}`,
            ...(contextLimitTokens !== undefined ? { contextLimitTokens } : {}),
        });
        return {
            kind: 'success',
            text: `model preference set to ${parsed.provider}/${parsed.model}\n`
                + '(status bar updated; the in-flight turn keeps its original model — '
                + 'the new model applies on the next turn.)',
        };
    },
};
export { parseModel, buildModelItems };
//# sourceMappingURL=model.js.map