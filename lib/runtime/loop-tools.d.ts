/**
 * kiro-loop owned tools (P3): `kiro_todo_write` and `kiro_think`, registered
 * on the platform tool registry so BOTH loops can use them, wired straight
 * into the TUI controller:
 *
 * - kiro_todo_write: replaces the transcript's checklist snapshot (same
 *   dedupe the platform todo projection applies) — the model gains the
 *   kiro-cli todo_list tool surface on the own-loop path.
 * - kiro_think: a scratchpad tool (kiro-cli's thinking tool): the model
 *   writes its atomic-step breakdown; the text rides the history for the
 *   model only and the transcript shows a one-line summary card.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/loop-tools
 */
import type { Context } from '@deepseek-ai/cordis';
export interface LoopToolDeps {
    readonly controller: {
        ingestEvent(event: unknown): void;
    };
    /** A2: ask_user 经 DialogPort（内核自有通道）；缺省回落平台 userQuestions。 */
    readonly dialogPort?: import('../dsh-adapter/ports').DialogPort;
}
/** Register both tools; returns the dispose pair. */
export declare function registerLoopTools(ctx: Context, deps: LoopToolDeps): () => void;
