function controllerOf(agentCtx) {
    const ctx = agentCtx.ctx;
    if (ctx === undefined || ctx === null)
        return undefined;
    const get = ctx.get;
    return typeof get === 'function' ? get.call(ctx, 'kiroController') : undefined;
}
/**
 * /approvals — manage persisted + session trust: whole tools and the finer
 * command/prefix patterns chosen in the approval panel's scope selector.
 *   /approvals                     list everything
 *   /approvals remove <kind> <n>   remove one entry
 *     kinds: project-tool | project-pattern | session-pattern
 */
export const approvalsCommand = {
    name: 'approvals',
    description: 'List / remove trusted tools and command patterns',
    input: { hint: '[remove project-tool|project-pattern|session-pattern <n>]' },
    handler: async ({ agent, rawInput }) => {
        const controller = controllerOf(agent);
        if (controller?.trustListing === undefined) {
            return { kind: 'error', text: '/approvals: 控制器不可用' };
        }
        const parts = rawInput.trim().split(/\s+/u).filter(Boolean);
        if (parts[0] === 'remove') {
            const kind = parts[1];
            const index = Number(parts[2]);
            if ((kind !== 'project-tool' && kind !== 'project-pattern' && kind !== 'session-pattern')
                || !Number.isInteger(index) || index < 1) {
                return { kind: 'error', text: 'usage: /approvals remove project-tool|project-pattern|session-pattern <序号>' };
            }
            const ok = controller.removeTrustEntry?.(kind, index - 1) === true;
            return {
                kind: ok ? 'success' : 'error',
                text: ok ? `已移除 ${kind} #${index}。` : `未找到 ${kind} #${index}。`,
            };
        }
        const listing = controller.trustListing();
        const lines = [];
        lines.push(`项目级整工具信任（${listing.projectTools.length}）：`);
        if (listing.projectTools.length === 0)
            lines.push('  （无）');
        listing.projectTools.forEach((tool, i) => { lines.push(`  ${i + 1}. ${tool}`); });
        lines.push('');
        lines.push(`项目级命令模式信任（${listing.projectPatterns.length}，写入 .kiro/approvals.json）：`);
        if (listing.projectPatterns.length === 0)
            lines.push('  （无）');
        listing.projectPatterns.forEach((p, i) => { lines.push(`  ${i + 1}. ${p.tool} · 前缀「${p.prefix}」`); });
        lines.push('');
        lines.push(`会话级命令模式信任（${listing.sessionPatterns.length}，退出失效）：`);
        if (listing.sessionPatterns.length === 0)
            lines.push('  （无）');
        listing.sessionPatterns.forEach((p, i) => { lines.push(`  ${i + 1}. ${p.tool} · 前缀「${p.prefix}」`); });
        lines.push('');
        lines.push('移除：/approvals remove project-tool|project-pattern|session-pattern <序号>');
        return { kind: 'success', text: lines.join('\n') };
    },
};
//# sourceMappingURL=approvals.js.map