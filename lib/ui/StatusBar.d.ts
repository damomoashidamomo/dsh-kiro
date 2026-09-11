/**
 * StatusBar — the bottom-of-screen line showing agent name, model, status,
 * token usage, and the active slash prefix. Always present; renders below
 * the Prompt component.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/StatusBar
 */
import type { AgentStatusSnapshot } from '../runtime/types';
export interface StatusBarProps {
    agent: AgentStatusSnapshot;
    /** Active prefix in the prompt — `'/' | '@' | '!' | undefined`. */
    prefix?: '/' | '@' | '!' | undefined;
    /** Current agent label (e.g. `'backend-specialist'`). */
    activeAgentName?: string | undefined;
}
/** Render the StatusBar. */
export declare function StatusBar({ agent, prefix, activeAgentName }: StatusBarProps): JSX.Element;
