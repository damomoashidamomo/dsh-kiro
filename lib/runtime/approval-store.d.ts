/**
 * Project-level trust store shape (`.kiro/approvals.json`):
 *   { tools: string[], patterns: { tool, prefix }[] }
 * `tools` = whole-tool allowances; `patterns` = finer-grained trust where
 * commands of `tool` starting with `prefix` auto-allow (kiro's scope
 * selector: full command / command prefix).
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/approval-store
 */
/** One finer-grained trust entry. */
export interface ApprovalPattern {
    readonly tool: string;
    readonly prefix: string;
}
