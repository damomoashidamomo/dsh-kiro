/**
 * `/engine` — whole-unit engine switch (P2): loop driver + tool engine in
 * ONE command, plus an honest capability readout.
 *
 *   /engine            status: both layers, rust availability, capabilities
 *   /engine kiro       kiro loop + Rust tool engine (falls back to platform
 *                      pipeline when the binary is not built)
 *   /engine kiro -p    kiro loop + platform tool pipeline (platform approvals
 *                      & sandbox inside ctx.tools)
 *   /engine dsh        back to the full platform stack
 *
 * @module @damomoashidamomo/dsh-kiro/commands/engine
 */
export const engineCommand = {
    name: 'engine',
    description: 'Whole-unit engine switch: loop + tool engine together',
    input: { hint: '<kiro|dsh> [-p]' },
    handler: async ({ agent, rawInput }) => {
        const ctx = agent.ctx;
        const get = ctx?.get;
        const service = typeof get === 'function'
            ? get.call(ctx, 'kiroEngineSwitch')
            : undefined;
        if (service === undefined) {
            return { kind: 'error', text: '/engine: 引擎切换服务不可用' };
        }
        const tokens = rawInput.trim().split(/\s+/u).filter(Boolean);
        if (tokens.length === 0) {
            const loopSvc = get?.call(ctx, 'kiroLoopMode');
            const toolSvc = get?.call(ctx, 'kiroToolEngine');
            const loop = loopSvc?.get?.() ?? '?';
            const tool = toolSvc?.get?.() ?? '?';
            const kiroCaps = loop === 'kiro'
                ? [
                    '  当前 kiro-loop 能力：工具循环✓ 审批门✓(双引擎) 中途插话✓ @文件注入✓',
                    '  回放落盘✓(sidecar) 自动压缩✓ 重试✓ 并行只读✓ 子代理✓ todo/think✓',
                    '  待建：Spec 流程(P3) / 循环透明视图(P5)',
                ]
                : ['  kiro-loop 能力（切到 /engine kiro 后可用）：工具循环·审批·插话·@注入·落盘回放·压缩·子代理'];
            return {
                kind: 'success',
                text: [
                    `引擎状态：loop=${loop} · tools=${tool} · rust可用=${toolSvc?.available?.() === true ? '是' : '否'}`,
                    ...kiroCaps,
                    '  /engine kiro  — 自研循环 + Rust 工具引擎（Landlock）',
                    '  /engine kiro -p — 自研循环 + 平台工具管线',
                    '  /engine dsh   — 回到 DSH 平台全套',
                ].join('\n'),
            };
        }
        const unit = tokens[0]?.toLowerCase();
        if (unit !== 'kiro' && unit !== 'dsh') {
            return { kind: 'error', text: 'usage: /engine <kiro|dsh> [-p]' };
        }
        const usePlatform = tokens.slice(1).some((t) => t === '-p' || t === '--platform');
        const message = await service.set(unit, unit === 'kiro' ? { rust: !usePlatform } : undefined);
        return { kind: 'success', text: message };
    },
};
//# sourceMappingURL=engine.js.map