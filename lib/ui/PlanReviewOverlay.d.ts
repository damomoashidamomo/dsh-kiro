/**
 * Panel for a pending structured question — plan review (`exit_plan_mode`)
 * and generic asks. Mirrors the approval panel's key model: number keys
 * direct-select, ↑↓+Enter list select, Esc dismisses (the model is told to
 * stay and wait for the user's own words), Ctrl+C stays with the App's
 * two-stage interrupt (cancels the turn, which aborts the question).
 *
 * Plan-review extra: choosing a NON-approve option opens a one-line
 * optional feedback input whose text goes back to the model (custom).
 * An approve selection never carries text (platform contract). Questions
 * without options are free-text only (custom answer, empty list).
 *
 * @module @damomoashidamomo/dsh-kiro/ui/plan-review-overlay
 */
import type { QuestionChoice, QuestionRequestUi } from '../runtime/types';
export interface PlanReviewOverlayProps {
    readonly request: QuestionRequestUi;
    readonly onResolve: (choice: QuestionChoice) => void;
}
export declare function PlanReviewOverlay({ request, onResolve }: PlanReviewOverlayProps): JSX.Element;
