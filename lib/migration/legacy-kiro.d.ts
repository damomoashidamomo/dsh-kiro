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
/** One migration pass's report. */
export interface MigrationResult {
    /** Destination root this pass wrote to. */
    readonly root: string;
    /** Legacy paths copied into the root. */
    readonly copied: string[];
    /** Legacy paths that existed but could not be copied (never fatal). */
    readonly failed: string[];
}
/**
 * Migrate one pair (legacy dir -> owned root). Idempotent via the marker file;
 * a missing legacy dir is a no-op.
 */
export declare function migrateLegacyRoot(legacyDir: string, root: string): MigrationResult;
/** Migrate both levels (user + workspace). Returns the two reports. */
export declare function migrateLegacyKiro(options?: {
    userRoot?: string;
    projectRoot?: string;
    legacyUserRoot?: string;
    legacyProjectRoot?: string;
}): {
    user: MigrationResult;
    project: MigrationResult;
};
/** Human-readable one-liner for the boot log. */
export declare function describeMigration(results: {
    user: MigrationResult;
    project: MigrationResult;
}): string | undefined;
/** Number of entries at the top of a directory (diagnostics/tests only). */
export declare function countEntries(dir: string): number;
