/**
 * dsh-kiro CLI startup — Commander adapter that parses the inner arguments
 * handed over by the `dsh --profile kiro` launcher, publishes a typed
 * `kiroStartup` service, and prints the TUI's `--help`.
 *
 * The launcher (`apps/cli/src/args.ts`) parses only `--profile`/`--patch`/
 * `--dump-config` and hands everything after them verbatim. This startup
 * plugin owns its flag family and its `--help` text — `--resume`, `--agent`,
 * `--list-models`, `--trust-all-tools`, etc. all live here.
 *
 * Mirrors `@deepseek-ai/dsh-web-app/startup` and `@deepseek-ai/dsh-headless/startup`
 * in shape, but provides a richer flag surface tuned for the Kiro CLI parity.
 *
 * @module @damomoashidamomo/dsh-kiro/startup
 */
import type { Context } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Resolved CLI values from `dsh --profile kiro` arguments. Provided once on startup. */
        kiroStartup?: KiroStartup;
    }
}
/** Stable Cordis plugin name. */
export declare const name = "kiro-startup";
/** Core services required before the CLI is parsed. */
export declare const inject: string[];
/** Service identifier published by this plugin's action. */
export declare const KIRO_STARTUP = "kiroStartup";
/** Single tool names that the CLI may pre-trust at startup. */
export type TrustList = 'all' | readonly string[];
/** Resolved startup values. */
export interface KiroStartup {
    /** Positional task text — when present the TUI seeds the prompt with it. */
    readonly task: string | undefined;
    /** Restore the most recent session from the current workspace. */
    readonly resume: boolean;
    /** Restore an explicit session by id. */
    readonly resumeId: string | undefined;
    /** Open the resume picker instead of starting a session. */
    readonly resumePicker: boolean;
    /** List all stored sessions and exit without booting the TUI. */
    readonly listSessions: boolean;
    /** Delete a stored session by id and exit. */
    readonly deleteSessionId: string | undefined;
    /** Restrict --delete-session lookups to one storage source. */
    readonly sessionSource: 'v1' | 'v2' | undefined;
    /** List available models and exit without booting the TUI. */
    readonly listModels: boolean;
    /** Override the model the agent selects at session start. */
    readonly model: string | undefined;
    /** Reasoning-effort override, model-dependent. */
    readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
    /** Agent engine override. */
    readonly agentEngine: 'v2' | 'v1' | 'kas' | undefined;
    /** Agent mode — vibe (default) or spec. */
    readonly mode: 'vibe' | 'spec' | undefined;
    /** Pre-trust all built-in tools. */
    readonly trustAllTools: boolean;
    /** Pre-trust a comma-separated list of tool names. */
    readonly trustTools: readonly string[] | undefined;
    /** Run non-interactively — process the task and exit. */
    readonly noInteractive: boolean;
    /** Output format for the non-interactive mode. */
    readonly format: 'plain' | 'json' | 'json-pretty' | undefined;
    /** Require every configured MCP server to start successfully. */
    readonly requireMcpStartup: boolean;
    /** Use the TUI surface. */
    readonly tui: boolean;
    /** Force the legacy (no-Ink) surface for parity checks. */
    readonly legacy: boolean;
    /** Wrap mode for stdout. */
    readonly wrap: 'always' | 'never' | 'auto' | undefined;
    /** Verbosity for diagnostic logging. */
    readonly verbose: number;
    /** Profile name override for the launched agent. */
    readonly agent: string | undefined;
}
/** Mount the kiro-startup plugin. */
export declare function apply(ctx: Context): void;
