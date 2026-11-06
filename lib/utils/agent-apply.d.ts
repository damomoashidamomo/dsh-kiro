/**
 * Apply a custom-agent preset to the LIVE session — the shared core behind
 * `/agent swap` AND boot-time `--agent` / `set-default` activation.
 *
 * Everything resolves through the agent-scope ctx services (same receiver
 * rules the swap path always used). Persona delivery is engine-aware:
 * kiro-loop folds it into the system prompt, the DSH engine has no per-session
 * system-prompt channel so it rides `opts.injectTurn` (a real instruction turn
 * the model acknowledges).
 *
 * @module @damomoashidamomo/dsh-kiro/utils/agent-apply
 */
export interface AgentPreset {
    model?: string;
    provider?: string;
    effort?: string;
    prompt?: string;
    engine?: string;
    toolEngine?: string;
    tools?: readonly string[];
    allowedTools?: readonly string[];
}
export interface ApplyPresetOptions {
    /** Where the persona is already in the system prompt (kiro engine), a
     * dsh-engine preset instead sends one instruction turn through this hook. */
    readonly injectTurn?: (text: string) => void;
}
/**
 * Apply the preset. Returns the human-readable "applied" lines for the swap /
 * boot confirmation message. Best-effort: a missing service skips that facet.
 */
export declare function applyAgentPreset(ctx: unknown, name: string, preset: AgentPreset, opts?: ApplyPresetOptions): Promise<string[]>;
