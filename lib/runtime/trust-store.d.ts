/**
 * Trust store (T-1 split from session-controller): the persistence and
 * matching layer behind the approval panel's finer-grained scopes —
 * project-level whole-tool allowances plus command-prefix patterns in
 * `.kiro/approvals.json` (v2; v1 files contribute their tools array).
 *
 * Pure module: no controller state, fully unit-testable.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/trust-store
 */
/** One finer-grained trust entry: commands of `tool` starting with `prefix`. */
export interface ApprovalPattern {
    readonly tool: string;
    readonly prefix: string;
}
/** Read persisted approvals (v2 patterns + v1 tools; missing file -> none). */
export declare function loadProjectApprovals(): string[];
export declare function loadProjectPatterns(): ApprovalPattern[];
/** Persist approvals (best effort): tools + command-prefix patterns. */
export declare function saveProjectApprovals(tools: readonly string[], patterns?: readonly ApprovalPattern[]): void;
/**
 * The command-relevant string of a pending request: bash -> `command`,
 * everything else -> the full argument JSON (prefix trust on non-shell
 * tools compares the whole payload).
 */
export declare function commandTextOf(toolName: string, argsJson: string | undefined): string | undefined;
/** Whether a (tool, args) pair matches any persisted prefix pattern. */
export declare function matchesTrustPattern(patterns: readonly {
    tool: string;
    prefix: string;
}[], toolName: string, args: string | undefined): boolean;
