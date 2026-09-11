/**
 * ProgressOverlay — a one-line spinner + status string rendered above the
 * StatusBar whenever the agent is running a tool or a turn. Disappears
 * automatically when `state.agent.status` returns to `idle`.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/ProgressOverlay
 */
export interface ProgressOverlayProps {
    /** Tool name being executed, if any. */
    readonly toolName: string | undefined;
    /** Whether the agent is currently in a turn. */
    readonly busy: boolean;
    /** Optional sub-status text (e.g. token-count summary). */
    readonly subtext: string | undefined;
}
/** Render a transient progress bar with a spinner. */
export declare function ProgressOverlay({ toolName, busy, subtext }: ProgressOverlayProps): JSX.Element | null;
