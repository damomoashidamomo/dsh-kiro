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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/** Path of the project-level approval store inside the workspace. */
function projectApprovalsPath() {
    return join(process.cwd(), '.kiro', 'approvals.json');
}
/** Read persisted approvals (v2 patterns + v1 tools; missing file -> none). */
export function loadProjectApprovals() {
    return loadProjectApprovalStore().tools;
}
export function loadProjectPatterns() {
    return loadProjectApprovalStore().patterns;
}
function loadProjectApprovalStore() {
    try {
        const raw = readFileSync(projectApprovalsPath(), 'utf8');
        const parsed = JSON.parse(raw);
        const tools = Array.isArray(parsed.tools)
            ? parsed.tools.filter((t) => typeof t === 'string' && t !== '')
            : [];
        const patterns = Array.isArray(parsed.patterns)
            ? parsed.patterns.filter((p) => {
                return typeof p === 'object' && p !== null
                    && typeof p.tool === 'string'
                    && typeof p.prefix === 'string';
            })
            : [];
        return { tools, patterns };
    }
    catch {
        return { tools: [], patterns: [] };
    }
}
/** Persist approvals (best effort): tools + command-prefix patterns. */
export function saveProjectApprovals(tools, patterns = []) {
    try {
        mkdirSync(join(process.cwd(), '.kiro'), { recursive: true });
        const payload = { tools: [...tools].sort(), patterns: [...patterns] };
        writeFileSync(projectApprovalsPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }
    catch {
        // Unwritable workspace: the allowance still holds for this session.
    }
}
/**
 * The command-relevant string of a pending request: bash -> `command`,
 * everything else -> the full argument JSON (prefix trust on non-shell
 * tools compares the whole payload).
 */
export function commandTextOf(toolName, argsJson) {
    if (argsJson === undefined)
        return undefined;
    try {
        const args = JSON.parse(argsJson);
        if (toolName === 'bash' && typeof args.command === 'string')
            return args.command.trim();
    }
    catch {
        // fall through to raw JSON
    }
    return argsJson.trim();
}
/** Whether a (tool, args) pair matches any persisted prefix pattern. */
export function matchesTrustPattern(patterns, toolName, args) {
    const command = args !== undefined ? args : undefined;
    if (command === undefined)
        return false;
    return patterns.some((p) => p.tool === toolName && command.startsWith(p.prefix));
}
//# sourceMappingURL=trust-store.js.map