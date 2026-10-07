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
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions';
/** Map one platform question onto the render-state shape. */
function toUi(item) {
    return {
        id: item.id,
        header: item.header,
        question: item.question,
        detail: item.detail,
        options: (item.options ?? []).map((option) => ({
            label: option.label,
            description: option.description,
        })),
        approveLabel: item.intent?.kind === 'plan-review' ? item.intent.approve : undefined,
    };
}
/** Map a UI choice onto the platform answer, or throw the cancel. */
function toAnswer(id, choice) {
    if (choice.kind === 'dismissed') {
        // plan-mode reads exactly this code as "the user dismissed the review to
        // speak instead; stay and wait".
        throw new UserQuestionError('the user dismissed the question to speak instead', 'ASK_CANCELLED');
    }
    const trimmed = choice.custom?.trim();
    return {
        answers: [{
                id,
                selected: [...choice.selected],
                // An approve answer must carry NO custom text (platform validation).
                ...(trimmed !== undefined && trimmed !== '' ? { custom: trimmed } : {}),
            }],
    };
}
/**
 * Compose the answerer. Questions are answered strictly in order (one panel
 * at a time); a dismissed panel cancels the whole request.
 */
export function createQuestionAnswerer(ui) {
    return async (request) => {
        const answers = [];
        for (const item of request.questions) {
            const choice = await ui.openQuestion(toUi(item), request.signal);
            // A dismissed panel throws ASK_CANCELLED here, cancelling the request.
            const answer = toAnswer(item.id, choice);
            answers.push(...answer.answers.map((entry) => ({ ...entry, selected: [...entry.selected] })));
        }
        return { answers };
    };
}
//# sourceMappingURL=question-answerer.js.map