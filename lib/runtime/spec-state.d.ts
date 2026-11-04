/**
 * Spec workflow state (P3-S1) — kiro-cli's confirm-first development cycle:
 * requirements → design → tasks → implement, each phase gated by an explicit
 * human `/spec approve`. State lives in `<workspace>/.kiro/specs/<feature>/spec.json`
 * so a spec survives restarts and can be resumed.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/spec-state
 */
export type SpecPhase = 'requirements' | 'design' | 'tasks' | 'implement' | 'done';
export interface SpecState {
    readonly feature: string;
    phase: SpecPhase;
    readonly createdAt: number;
    updatedAt: number;
}
export declare function specDir(workspaceRoot: string, feature: string): string;
export declare function loadSpec(workspaceRoot: string, feature: string): SpecState | undefined;
export declare function saveSpec(workspaceRoot: string, state: SpecState): void;
/** The active spec = the newest non-done spec.json in .kiro/specs/. */
export declare function activeSpec(workspaceRoot: string): SpecState | undefined;
export declare const NEXT_PHASE: Record<Exclude<SpecPhase, 'done'>, SpecPhase>;
export declare const PHASE_LABEL: Record<SpecPhase, string>;
/** The instruction submitted to the model for a phase (confirm-first cycle). */
export declare function phaseInstruction(state: SpecState): string;
