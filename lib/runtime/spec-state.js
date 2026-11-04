/**
 * Spec workflow state (P3-S1) — kiro-cli's confirm-first development cycle:
 * requirements → design → tasks → implement, each phase gated by an explicit
 * human `/spec approve`. State lives in `<workspace>/.kiro/specs/<feature>/spec.json`
 * so a spec survives restarts and can be resumed.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/spec-state
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export function specDir(workspaceRoot, feature) {
    return join(workspaceRoot, '.kiro', 'specs', feature);
}
export function loadSpec(workspaceRoot, feature) {
    try {
        const path = join(specDir(workspaceRoot, feature), 'spec.json');
        if (!existsSync(path))
            return undefined;
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        if (typeof parsed.feature !== 'string' || typeof parsed.phase !== 'string')
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
export function saveSpec(workspaceRoot, state) {
    const dir = specDir(workspaceRoot, state.feature);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'spec.json'), `${JSON.stringify({ ...state, updatedAt: Date.now() }, null, 2)}\n`, 'utf8');
}
/** The active spec = the newest non-done spec.json in .kiro/specs/. */
export function activeSpec(workspaceRoot) {
    try {
        const root = join(workspaceRoot, '.kiro', 'specs');
        if (!existsSync(root))
            return undefined;
        let best;
        for (const entry of readdirSync(root)) {
            const state = loadSpec(workspaceRoot, entry);
            if (state === undefined || state.phase === 'done')
                continue;
            if (best === undefined || state.updatedAt > best.updatedAt)
                best = state;
        }
        return best;
    }
    catch {
        return undefined;
    }
}
export const NEXT_PHASE = {
    requirements: 'design',
    design: 'tasks',
    tasks: 'implement',
    implement: 'done',
};
export const PHASE_LABEL = {
    requirements: '需求 requirements.md',
    design: '设计 design.md',
    tasks: '任务拆解 tasks.md',
    implement: '实施（按 tasks 逐项）',
    done: '已完成',
};
/** The instruction submitted to the model for a phase (confirm-first cycle). */
export function phaseInstruction(state) {
    const dir = `.kiro/specs/${state.feature}`;
    switch (state.phase) {
        case 'requirements':
            return [
                `[spec·需求阶段] 请为「${state.feature}」起草需求文档，写入 ${dir}/requirements.md：`,
                '1. 目标与背景（为什么做）；',
                '2. 用户故事/验收标准（可测试的条目）；',
                '3. 范围内/范围外；',
                '4. 未决问题（有疑问就列出，等我回答）。',
                '只写文件，不要开始实现。写完后提醒我用 /spec approve 进入下一阶段，或直接告诉你想改哪里。',
            ].join('\n');
        case 'design':
            return [
                `[spec·设计阶段] 基于已批准的需求（${dir}/requirements.md），起草技术设计，写入 ${dir}/design.md：`,
                '1. 方案概述与选型理由（含被否方案）；',
                '2. 涉及文件/模块清单；',
                '3. 接口与数据结构变化；',
                '4. 风险与回滚方式。',
                '只写文件，不要开始实现。写完后提醒我 /spec approve。',
            ].join('\n');
        case 'tasks':
            return [
                `[spec·任务阶段] 基于设计（${dir}/design.md）拆解实施任务，写入 ${dir}/tasks.md：`,
                '逐条编号（- [ ] 1. ...），每条一个可独立验证的小步，标注涉及文件。',
                '只写文件。写完后提醒我 /spec approve 开始实施。',
            ].join('\n');
        case 'implement':
            return [
                `[spec·实施阶段] 严格按 ${dir}/tasks.md 逐项实施：`,
                '1. 每完成一项就把对应条目勾选为 - [x]；',
                '2. 全部完成后运行可用的验证（构建/测试）并汇报结果；',
                '3. 不做任务清单之外的改动；发现清单缺项先停下来问我。',
            ].join('\n');
        default:
            return '';
    }
}
//# sourceMappingURL=spec-state.js.map