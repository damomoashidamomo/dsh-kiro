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
/**
 * Stable identity of the session, as plain text: agent, workspace, model and
 * the kiro engine combo. The boot line prints this ONCE into the transcript
 * (kiro-cli prints `Model: auto (/model to change)` the same way), and the
 * live bar is compared against it — an unchanged identity needs no bar.
 */
export declare function identityText(agent: AgentStatusSnapshot, activeAgentName?: string | undefined): string;
/**
 * Whether the live status bar is worth a row.
 *
 * kiro-cli has NO persistent bar: its context usage rides the prompt gutter
 * and the model is announced once at boot, so an echoed prompt line sits
 * directly above the prompt. The bar here is therefore transient — it appears
 * only when it has news: the identity changed since boot, a prefix is active,
 * or a decision (approval / question) is waiting.
 */
export declare function shouldShowStatusBar(input: {
    readonly agent: AgentStatusSnapshot;
    readonly activeAgentName?: string | undefined;
    readonly prefix?: '/' | '@' | '!' | undefined;
    readonly bootIdentity?: string | undefined;
    readonly awaitingDecision?: boolean;
}): boolean;
/** Render the StatusBar. */
export declare function StatusBar({ agent, prefix, activeAgentName }: StatusBarProps): JSX.Element;
