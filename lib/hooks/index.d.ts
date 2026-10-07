/**
 * Kiro hooks loader — the B-option self-owned `.kiro/hooks.json` engine.
 *
 * Reads Claude-Code-compatible command hooks from (in run order per event):
 *   1. `~/.kiro/hooks.json`  — user level
 *   2. `<workspace>/.kiro/hooks.json` — project level (session cwd)
 *
 * and wires them onto the harness interception extension points using the
 * platform's `dsh-hook-protocol` (matching, execution via ctx.shell, decision
 * folding, durable `hook/invoked`/`hook/result` audit). The payload dialect
 * stays Claude-Code-shaped so existing hook scripts run unmodified.
 *
 * Supported points (kiro parity):
 *   SessionStart → agent/session-start   (detached context inject)
 *   UserPromptSubmit → agent/pre-step    (waterfall, can reject)
 *   PreToolUse → tools/pre-execute       (waterfall, deny/ask)
 *   PostToolUse → tools/post-execute     (waterfall, block w/ feedback)
 *   Stop → agent/turn-stopping           (serial; deny forces another step)
 *   SubagentStart/SubagentStop → subagent/start | subagent/end
 *
 * Exposes `KIRO_HOOKS` for the /hooks command: the loaded config entries and
 * a bounded ring of recent invocations. Config is read once at plugin start
 * (platform bridge semantics); a missing file simply registers no hooks.
 *
 * @module @damomoashidamomo/dsh-kiro/hooks
 */
import type { Context } from '@deepseek-ai/cordis';
/** The seven supported hook points. */
export type HookPoint = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop' | 'SubagentStart' | 'SubagentStop';
/** One configured hook as /hooks renders it. */
export interface HookConfigEntry {
    readonly source: 'user' | 'workspace';
    readonly point: HookPoint;
    readonly matcher: string | undefined;
    readonly command: string;
}
/** One recent invocation record (mirrors the durable pair, best-effort). */
export interface HookRunRecord {
    readonly point: HookPoint;
    readonly matcher: string | undefined;
    readonly decision: string;
    readonly exitCode: number | undefined;
    readonly durationMs: number;
}
/** Service surface the /hooks command reads. */
export interface KiroHooksService {
    /** Where each discovered config file lives, and whether it loaded. */
    readonly sources: readonly {
        readonly path: string;
        readonly loaded: boolean;
        readonly reason?: string;
    }[];
    /** All configured command hooks in run order. */
    readonly entries: readonly HookConfigEntry[];
    /** The most recent invocations (bounded ring). */
    recent(limit?: number): readonly HookRunRecord[];
}
export declare const KIRO_HOOKS = "kiroHooks";
export declare function getKiroHooks(): KiroHooksService | undefined;
export declare const name = "kiro-hooks";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
