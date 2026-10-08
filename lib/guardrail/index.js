/**
 * kiro-guardrail — the confirm-first mindset as a built-in system-prompt
 * section (P11, from the kiro-habits analysis): before mutating production
 * environments (service restarts, deployments, cluster operations) or
 * writing configuration outside the repository, the agent must state its
 * plan and impact and wait for explicit approval. Project steering loaded
 * later in the prompt can sharpen or relax this rule.
 *
 * @module @damomoashidamomo/dsh-kiro/guardrail
 */
/** Stable Cordis plugin name. */
export const name = 'kiro-guardrail';
/** The section's fixed guidance text. */
export const GUARDRAIL_TEXT = [
    '## 变更护栏（dsh-kiro 内置）',
    '',
    '涉及生产环境变更（服务启停/重启、部署、集群与网络操作、删除或覆盖数据）或修改仓库之外的配置文件时：',
    '1. 先陈述计划：要做什么、影响面（哪些服务/节点/文件）、回滚方式；',
    '2. 等待用户明确批准后再执行；用户说"直接做/不用问"的，本轮可免重复确认；',
    '3. 仓库内的常规代码编辑不受此约束。',
    '',
    '宁可多问一句，不可替用户决定生产变更。',
].join('\n');
/** Mount the guardrail section (order 640, before kiro:steering at 650). */
export function apply(ctx) {
    ctx.inject(['systemPrompt'], (scope) => {
        scope.systemPrompt.section({
            name: 'kiro:guardrail',
            // Just below steering (650): a baseline the project can override.
            order: 640,
            text: () => GUARDRAIL_TEXT,
        });
    });
}
//# sourceMappingURL=index.js.map