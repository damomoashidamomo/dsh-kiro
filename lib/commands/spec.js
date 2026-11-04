/**
 * `/spec` — kiro-cli's confirm-first development cycle (P3-S1):
 *   /spec start <feature>   begin: the model drafts requirements.md
 *   /spec approve           human gate: advance to the next phase
 *   /spec show              current phase + files
 *   /spec revise <note>     bounce back to the current phase with feedback
 *   /spec abort             abandon the active spec
 * Phase order: requirements → design → tasks → implement → done. The model
 * never advances a phase by itself — only /spec approve does.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/spec
 */
import { activeSpec, loadSpec, saveSpec, NEXT_PHASE, PHASE_LABEL, phaseInstruction } from "../runtime/spec-state.js";
export const specCommand = {
    name: 'spec',
    description: 'Confirm-first spec workflow: requirements → design → tasks → implement',
    input: { hint: '<start|approve|show|revise|abort>' },
    handler: async ({ agent, rawInput }) => {
        const ctx = agent.ctx;
        const get = ctx?.get;
        const submitSvc = typeof get === 'function'
            ? get.call(ctx, 'kiroRetry')
            : undefined;
        if (submitSvc?.submit === undefined) {
            return { kind: 'error', text: '/spec: 提交服务不可用' };
        }
        const cwd = process.cwd();
        const tokens = rawInput.trim().split(/\s+/u).filter(Boolean);
        const sub = tokens[0] ?? 'show';
        if (sub === 'start') {
            const feature = tokens.slice(1).join('-').replace(/[^\w\u4e00-\u9fff-]/gu, '');
            if (feature === '')
                return { kind: 'error', text: 'usage: /spec start <feature 名称>' };
            const existing = loadSpec(cwd, feature);
            const state = existing ?? { feature, phase: 'requirements', createdAt: Date.now(), updatedAt: Date.now() };
            saveSpec(cwd, state);
            submitSvc.submit(phaseInstruction(state));
            return { kind: 'success', text: `◇ Spec「${feature}」启动（阶段：${PHASE_LABEL[state.phase]}）。确认后才进入下一阶段：/spec approve` };
        }
        const active = activeSpec(cwd);
        if (active === undefined) {
            return { kind: 'success', text: '没有进行中的 spec。用 /spec start <feature> 开始（先确认后开发流程）。' };
        }
        if (sub === 'show') {
            return {
                kind: 'success',
                text: [
                    `Spec「${active.feature}」当前阶段：${PHASE_LABEL[active.phase]}`,
                    `  目录：.kiro/specs/${active.feature}/`,
                    '  /spec approve  确认本阶段，进入下一阶段',
                    '  /spec revise <意见>  打回本阶段修改',
                    '  /spec abort  放弃',
                ].join('\n'),
            };
        }
        if (sub === 'approve') {
            const next = NEXT_PHASE[active.phase];
            if (next === undefined || active.phase === 'done') {
                return { kind: 'success', text: `Spec「${active.feature}」已完成。` };
            }
            active.phase = next;
            saveSpec(cwd, active);
            if (next === 'done') {
                return { kind: 'success', text: `✓ Spec「${active.feature}」全部阶段完成。` };
            }
            submitSvc.submit(phaseInstruction(active));
            return { kind: 'success', text: `✓ 已确认。进入阶段：${PHASE_LABEL[next]}` };
        }
        if (sub === 'revise') {
            const note = tokens.slice(1).join(' ');
            submitSvc.submit(`[spec·修改] 请按以下意见修改当前阶段（${PHASE_LABEL[active.phase]}）的文档后再次提醒我确认：${note}`);
            return { kind: 'success', text: '已打回当前阶段并转达修改意见。' };
        }
        if (sub === 'abort') {
            active.phase = 'done';
            saveSpec(cwd, active);
            return { kind: 'success', text: `已放弃 Spec「${active.feature}」相关流程（文件保留）。` };
        }
        return { kind: 'error', text: 'usage: /spec <start|approve|show|revise|abort>' };
    },
};
//# sourceMappingURL=spec.js.map