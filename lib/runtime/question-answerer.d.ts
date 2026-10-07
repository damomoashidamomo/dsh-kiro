/**
 * TUI answerer for the platform's user-questions seam. `dsh-plan-mode`'s
 * `exit_plan_mode` (and any future asker, e.g. `dsh-tool-ask-user`) pauses
 * the tool call on the agent-scoped `'user-questions/request'` waterfall
 * until a human answers; this module claims the request, drives the
 * SessionController's question panel, and maps the choice back onto the
 * platform's answer / ASK_CANCELLED contract.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/question-answerer
 */
import type { QuestionRequestUi } from './types';
import type { QuestionChoice } from './types';
/** Structural shape of one question in a request (platform type, restated). */
export interface QuestionItemLike {
    readonly id: string;
    readonly header?: string;
    readonly question: string;
    readonly detail?: string;
    readonly options?: readonly {
        readonly label: string;
        readonly description?: string;
    }[];
    readonly intent?: {
        readonly kind: 'plan-review';
        readonly approve: string;
    };
}
/** Structural shape of the waterfall request. */
export interface QuestionRequestLike {
    readonly questions: readonly QuestionItemLike[];
    readonly signal?: AbortSignal;
}
/** Structural shape of the answer the waterfall expects back. */
export interface QuestionAnswerLike {
    readonly answers: {
        id: string;
        selected: string[];
        custom?: string;
    }[];
}
/** UI surface the answerer drives (SessionController implements this). */
export interface QuestionUi {
    openQuestion(request: QuestionRequestUi, signal?: AbortSignal): Promise<QuestionChoice>;
}
/**
 * Compose the answerer. Questions are answered strictly in order (one panel
 * at a time); a dismissed panel cancels the whole request.
 */
export declare function createQuestionAnswerer(ui: QuestionUi): (request: QuestionRequestLike) => Promise<QuestionAnswerLike>;
