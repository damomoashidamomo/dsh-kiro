/**
 * `/loop` — choose the turn driver: `dsh` (the platform's dsh-agent-loop,
 * full tools) or `kiro` (dsh-kiro's own driver: full tool loop,
 * toolsSettings matrix, retry, auto-compaction, Rust engine optional). The transcript and approvals UI are shared;
 * only the turn engine differs.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/loop
 */
export const loopCommand = {
    name: 'loop',
    description: 'Turn driver: dsh (platform loop) | kiro (own loop, full tools)',
    input: { hint: '<dsh|kiro>' },
    handler: async ({ agent, rawInput }) => {
        const ctx = agent.ctx;
        const get = ctx?.get;
        const service = typeof get === 'function'
            ? get.call(ctx, 'kiroLoopMode')
            : undefined;
        if (service?.set === undefined) {
            return { kind: 'error', text: '/loop: loop 模式服务不可用' };
        }
        const arg = rawInput.trim().toLowerCase();
        if (arg === '') {
            // One-stop status: BOTH engine switches plus rust availability, so the
            // two-layer model (loop = who drives the turn, tools = who executes
            // bash/读写 inside the kiro loop) is visible at a glance.
            const engine = get?.call(ctx, 'kiroToolEngine');
            return {
                kind: 'success',
                text: [
                    `当前 loop：${service.get?.() ?? '?'}（谁来驱动回合）`,
                    '  /loop dsh  — DSH 平台 agent loop（完整工具链，/tools 不适用）',
                    '  /loop kiro — dsh-kiro 自研驱动（完整工具循环）',
                    `当前工具引擎：${engine?.get?.() ?? '?'}（仅 /loop kiro 生效；bash/读写由谁执行）`,
                    `  Rust 引擎可用：${engine?.available?.() === true ? '是（已构建）' : '否（仓库执行 pnpm build:engine）'}`,
                    '  /tools dsh  — 平台工具管线（平台沙箱 + 审批）',
                    '  /tools rust — Rust 引擎（Landlock 内核级沙箱，每次调用新进程）',
                ].join('\n'),
            };
        }
        if (arg === 'trace') {
            const traceSvc = get?.call(ctx, 'kiroLoopTrace');
            const rows = traceSvc?.recent?.() ?? [];
            if (rows.length === 0) {
                return { kind: 'success', text: 'kiro-loop 尚无 trace（切到 /loop kiro 跑一轮后可见每步记录）。' };
            }
            const lines = rows.map((row) => {
                const time = new Date(row.at).toTimeString().slice(0, 8);
                return `  ${time}  ${row.text}`;
            });
            return { kind: 'success', text: [`kiro-loop trace（最近 ${rows.length} 条）：`, ...lines].join('\n') };
        }
        if (arg !== 'dsh' && arg !== 'kiro') {
            return { kind: 'error', text: 'usage: /loop <dsh|kiro|trace>' };
        }
        return { kind: 'success', text: service.set(arg) };
    },
};
//# sourceMappingURL=loop.js.map