/**
 * `/doctor` — one-command health report (T-6). Collects everything that has
 * ever needed manual checking during debugging sessions:
 *
 * - package version + profile + DSH_HOME;
 * - the Cordis services this bundle depends on (each `ctx.get` — a missing
 *   one explains a "服务不可用" error immediately);
 * - whether the ink log-update/use-input patches are actually IN the
 *   installed tree (pnpm has served stale unpacked builds before);
 * - the ansi-tokenize override (0.3.1 — OSC 8 links die on 0.1.3);
 * - the current model's effort-ladder provenance;
 * - terminal capabilities (truecolor is load-bearing: past width bugs only
 *   reproduced with SGR present);
 * - workspace steering/hooks/paste state.
 *
 * Everything is best-effort: a failing probe reports ✗ and keeps going.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/doctor
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { resolveEffortLevels, effortSourceLabel } from "../runtime/effort-levels.js";
const HERE = typeof import.meta.url === 'string' ? new URL('.', import.meta.url).pathname : process.cwd();
/**
 * Resolve a package's ROOT directory best-effort: the resolved entry is
 * usually <root>/build/index.js, so walk up until a package.json appears
 * (bounded) instead of assuming the dist layout.
 */
function pkgRoot(name) {
    try {
        const require = createRequire(import.meta.url);
        let dir = require.resolve(name).replace(/\/$/, '');
        for (let i = 0; i < 6; i += 1) {
            const parent = dir.replace(/\/[^/]*$/, '');
            if (parent === dir)
                return undefined;
            try {
                readFileSync(join(parent, 'package.json'));
                return parent;
            }
            catch {
                dir = parent;
            }
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** Read a text file inside an installed package best-effort. */
function pkgFile(name, file) {
    const root = pkgRoot(name);
    if (root === undefined)
        return undefined;
    try {
        return readFileSync(join(root, file), 'utf8');
    }
    catch {
        return undefined;
    }
}
function pkgVersion(name) {
    // ansi-tokenize's package.json declares no exports main, so bare resolve
    // throws — find it as a sibling of the (resolvable) ink install instead.
    const inkRoot = pkgRoot('ink');
    const candidates = [
        ...(inkRoot !== undefined ? [join(inkRoot, '..', name), join(inkRoot, 'node_modules', name)] : []),
    ];
    for (const dir of candidates) {
        try {
            return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
        }
        catch {
            // next candidate
        }
    }
    try {
        const require = createRequire(import.meta.url);
        return JSON.parse(readFileSync(join(require.resolve(name).replace(/\/[^/]*$/, ''), '..', 'package.json'), 'utf8')).version;
    }
    catch {
        return undefined;
    }
}
/** Yes/no with the evidence line kept short. */
const mark = (ok) => (ok ? '✓' : '✗');
export const doctorCommand = {
    name: 'doctor',
    description: 'Health report: versions, services, patches, terminal, workspace',
    handler: async ({ agent }) => {
        const lines = [];
        const ctx = agent.ctx;
        const get = ctx?.get?.bind(ctx);
        // -- identity ----------------------------------------------------------
        let ownVersion = 'unknown';
        try {
            const require = createRequire(import.meta.url);
            ownVersion = JSON.parse(readFileSync(require.resolve('@damomoashidamomo/dsh-kiro/package.json'), 'utf8')).version;
        }
        catch { /* keep unknown */ }
        const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
        lines.push('━━━ dsh-kiro /doctor ━━━');
        lines.push(`  版本         dsh-kiro ${ownVersion} · profile kiro · DSH_HOME=${dshHome}`);
        // -- services ----------------------------------------------------------
        const services = [
            'kiroController', 'kiroSessionSwitch', 'kiroSessionReader', 'kiroRetry',
            'kiroEffortControl', 'kiroInterrupt', 'kiroModelSwitch', 'kiroEffortProbe',
            'fileReferences', 'sessionQuery',
        ];
        const missing = services.filter((name) => get?.(name) === undefined);
        lines.push(`  服务装载     ${mark(missing.length === 0)} ${services.length - missing.length}/${services.length} 就绪`
            + (missing.length > 0 ? `（缺失：${missing.join(', ')}）` : ''));
        // -- patches -----------------------------------------------------------
        const logUpdate = pkgFile('ink', 'build/log-update.js');
        const useInput = pkgFile('ink', 'build/hooks/use-input.js');
        const tokenizeVersion = pkgVersion('@alcalzone/ansi-tokenize');
        const patchesOk = (logUpdate?.includes('dsh-kiro patch') ?? false)
            && (logUpdate?.includes('__kiroCaret') ?? false)
            && (useInput?.includes("keypress.name === 'home'") ?? false);
        lines.push(`  ink 补丁     ${mark(patchesOk)} log-update 帧尾/光标定位 + use-input home/end`
            + (patchesOk ? '' : '（未生效：pnpm 可能装了未打补丁的 ink——重装依赖）'));
        const tokenizeOk = tokenizeVersion !== undefined && !tokenizeVersion.startsWith('0.1.');
        lines.push(`  tokenize     ${mark(tokenizeOk)} @alcalzone/ansi-tokenize ${tokenizeVersion ?? '未找到'}`
            + (tokenizeOk ? '' : '（0.1.x 会拆坏 OSC 8 链接——检查 overrides）'));
        // -- model + effort ----------------------------------------------------
        const controller = get?.('kiroController');
        const agentState = controller?.getState?.().agent;
        if (agentState?.activeProvider !== undefined && agentState.activeModel !== undefined) {
            const settings = get?.('settings');
            const piAi = settings?.get?.('llm-pi-ai');
            const ladder = resolveEffortLevels(piAi, agentState.activeProvider, agentState.activeModel);
            lines.push(`  当前模型     ${agentState.activeProvider}/${agentState.activeModel}`
                + (agentState.contextLimitTokens !== undefined ? ` · 窗口 ${agentState.contextLimitTokens}` : ' · 窗口未声明'));
            lines.push(`  思考档位     ${mark(ladder !== undefined)} ${ladder?.levels.join('/') ?? '—'}（${ladder !== undefined ? effortSourceLabel(ladder.source) : '未知'}）`);
        }
        else {
            lines.push('  当前模型     ✗ 无法读取（kiroController 状态不可用）');
        }
        // -- terminal ----------------------------------------------------------
        const columns = process.stdout.columns ?? 0;
        const colorTerm = process.env.COLORTERM ?? '';
        lines.push(`  终端         ${columns} 列 · TERM=${process.env.TERM ?? '?'} · COLORTERM=${colorTerm || '(无)'}`
            + (colorTerm === 'truecolor' || colorTerm === '24bit' ? '（真彩色）' : '（无真彩色——部分宽度 bug 只在真彩下暴露）'));
        // -- workspace ---------------------------------------------------------
        const cwd = process.cwd();
        const checks = [
            ['.kiro/steering', join(cwd, '.kiro', 'steering')],
            ['.kiro/skills', join(cwd, '.kiro', 'skills')],
            ['.kiro/hooks.json', join(cwd, '.kiro', 'hooks.json')],
            ['.kiro/approvals.json', join(cwd, '.kiro', 'approvals.json')],
            ['.kiro/paste', join(cwd, '.kiro', 'paste')],
        ];
        const present = checks.filter(([, path]) => existsSync(path)).map(([label]) => label);
        lines.push(`  工作区       ${cwd}`);
        lines.push(`              ${mark(true)} ${present.length > 0 ? present.join(' · ') : '（无 .kiro 配置——steering/hooks 均未启用，属正常）'}`);
        lines.push('');
        lines.push('  有 ✗ 项时把本输出完整发给维护者即可定位。');
        return { kind: 'success', text: lines.join('\n') };
    },
};
//# sourceMappingURL=doctor.js.map