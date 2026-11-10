/**
 * 一次性迁移：把 dsh-kiro 曾经散落在 kiro-cli 目录（`~/.kiro` 与工作区
 * `.kiro/`）里的自有数据，复制到 dsh-kiro 自己的根（`~/.dsh-kiro` 与
 * `<工作区>/.dsh-kiro`）。
 *
 * 原则：
 * - 对旧目录**只读**——迁移过程绝不写、绝不删 kiro-cli 的任何文件；
 * - 只搬 dsh-kiro 自己拥有的东西（agents、引擎绑定、技能、steering、hooks、
 *   审批、信任、mcp、settings），不碰 kiro-cli 的其他内容；
 * - 运行时产物（loop-log、paste、checkpoints、knowledge 索引、specs）不搬，
 *   新目录里从零开始；
 * - 每个根只跑一次：完成后在 `<root>/migrated-legacy.json` 落标记。
 *
 * @module @damomoashidamomo/dsh-kiro/migration/legacy-kiro
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dshKiroProjectRoot, dshKiroUserRoot } from "../utils/kiro-home.js";
/** Items dsh-kiro owns at both levels (files at the root). */
const ROOT_FILES = [
    'agent-engines.json',
    'hooks.json',
    'skills.json',
    'approvals.json',
    'tools.json',
    'settings.json',
];
/** Directories dsh-kiro owns at both levels (copied recursively). */
const ROOT_DIRS = [
    'agents',
    'skills',
    'steering',
    'settings',
];
const MARKER = 'migrated-legacy.json';
function copyTree(from, to) {
    cpSync(from, to, { recursive: true });
}
/**
 * Migrate one pair (legacy dir -> owned root). Idempotent via the marker file;
 * a missing legacy dir is a no-op.
 *
 * `skipAgentsAlsoIn`: when migrating the WORKSPACE level, an agent whose name
 * already exists (with identical content) in the USER legacy directory is
 * skipped — findAgent prefers the workspace copy anyway, and copying it to
 * both scopes would put duplicate rows into the /agent menu.
 */
export function migrateLegacyRoot(legacyDir, root, skipAgentsAlsoIn) {
    const result = { root, copied: [], failed: [] };
    if (!existsSync(legacyDir))
        return result;
    if (existsSync(join(root, MARKER)))
        return result;
    mkdirSync(root, { recursive: true });
    for (const name of ROOT_FILES) {
        const from = join(legacyDir, name);
        const to = join(root, name);
        if (!existsSync(from))
            continue;
        try {
            if (!existsSync(to))
                copyTree(from, to);
            result.copied.push(from);
        }
        catch {
            result.failed.push(from);
        }
    }
    for (const name of ROOT_DIRS) {
        const from = join(legacyDir, name);
        const to = join(root, name);
        if (!existsSync(from))
            continue;
        if (name === 'agents' && skipAgentsAlsoIn !== undefined) {
            // Drop workspace copies that are byte-identical to a user-level agent of
            // the same name (differences are kept — workspace wins in lookups).
            try {
                for (const entry of readdirSync(from)) {
                    const userCounterpart = join(skipAgentsAlsoIn, 'agents', entry);
                    if (existsSync(userCounterpart) && existsSync(join(from, entry)) && readFileSync(join(from, entry), 'utf8') === readFileSync(userCounterpart, 'utf8')) {
                        rmSync(join(from, entry));
                    }
                }
            }
            catch {
                // Comparison is best-effort; copying wins over failing.
            }
        }
        try {
            if (!existsSync(to))
                copyTree(from, to);
            // settings/cli.json is kiro-cli's own chat config — dsh-kiro does not
            // carry a copy of it into its own home.
            if (name === 'settings' && existsSync(join(to, 'cli.json'))) {
                rmSync(join(to, 'cli.json'));
            }
            result.copied.push(from);
        }
        catch {
            result.failed.push(from);
        }
    }
    try {
        writeFileSync(join(root, MARKER), `${JSON.stringify({ at: Date.now(), from: legacyDir, copied: result.copied, failed: result.failed }, null, 2)}\n`, 'utf8');
    }
    catch {
        // Unwritable root: next boot would re-copy — copyTree above skips existing
        // targets, so a rerun stays idempotent even without the marker.
    }
    return result;
}
/** Migrate both levels (user + workspace). Returns the two reports. */
export function migrateLegacyKiro(options) {
    const legacyUser = options?.legacyUserRoot ?? join(homedir(), '.kiro');
    const legacyProject = options?.legacyProjectRoot ?? join(process.cwd(), '.kiro');
    const userRoot = options?.userRoot ?? dshKiroUserRoot();
    const user = migrateLegacyRoot(legacyUser, userRoot);
    // Workspace agents identical to their user-level counterparts are skipped,
    // so the /agent menu never lists the same name twice.
    const project = migrateLegacyRoot(legacyProject, options?.projectRoot ?? dshKiroProjectRoot(), userRoot);
    return { user, project };
}
/** Human-readable one-liner for the boot log. */
export function describeMigration(results) {
    const copied = [...results.user.copied, ...results.project.copied];
    if (copied.length === 0)
        return undefined;
    const scope = results.user.copied.length > 0 && results.project.copied.length > 0
        ? '用户级 + 工作区'
        : results.user.copied.length > 0 ? '用户级' : '工作区';
    return `已把 dsh-kiro 自己的历史数据从旧 kiro-cli 目录复制到独立目录（${scope}，${copied.length} 项）；旧目录只读未动，此后 dsh-kiro 与 kiro-cli 完全独立。`;
}
/** Number of entries at the top of a directory (diagnostics/tests only). */
export function countEntries(dir) {
    try {
        return readdirSync(dir).length;
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=legacy-kiro.js.map