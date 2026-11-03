/**
 * toolsSettings matrix (P2, kiro-cli-compatible): per-tool allow/deny rules
 * evaluated BEFORE the platform tool pipeline — deny-first, anchored command
 * regex (kiro-cli semantics: patterns must match the whole command), gitignore-style
 * path globs, and autoAllowReadonly for read-only shell commands.
 *
 * File: `.kiro/tools.json`
 *   { "tools": {
 *       "bash": { "allowedCommands": ["git status"], "deniedCommands": ["rm .*"],
 *                 "autoAllowReadonly": true },
 *       "write": { "allowedPaths": ["./src/**"], "deniedPaths": ["**" + "/.env"] } } }
 *
 * Decision: 'allow' skips the approval prompt (matrix already consented),
 * 'deny' refuses without executing, 'prompt' defers to the platform approval
 * waterfall unchanged.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/tool-settings
 */
/** One tool's rules. */
export interface ToolRule {
    readonly allowedCommands?: readonly string[];
    readonly deniedCommands?: readonly string[];
    readonly allowedPaths?: readonly string[];
    readonly deniedPaths?: readonly string[];
    readonly autoAllowReadonly?: boolean;
}
export interface ToolsSettings {
    readonly tools?: Readonly<Record<string, ToolRule>>;
}
/** Outcome of the matrix evaluation. */
export type SettingsVerdict = 'allow' | 'deny' | 'prompt';
/** Load `.kiro/tools.json` best-effort. */
export declare function loadToolsSettings(cwd?: string): ToolsSettings;
/** The command-relevant text of a tool call (bash -> command, else raw JSON). */
export declare function commandTextOfCall(name: string, args: unknown): string;
/** The path-relevant text of a file tool call. */
export declare function pathTextOfCall(args: unknown): string;
/** Rule lookup tolerant of kiro-cli tool spellings (bash/execute_bash…). */
export declare function ruleFor(settings: ToolsSettings, toolName: string): ToolRule | undefined;
/**
 * Evaluate the matrix for one call. Deny wins; explicit allow bypasses the
 * approval prompt; readonly auto-allow applies only to the bash family.
 */
export declare function verdictFor(settings: ToolsSettings, toolName: string, args: unknown): SettingsVerdict;
