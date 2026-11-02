/**
 * Turn-failure classification — turn an LlmFailure-shaped error into an
 * actionable, human-readable hint instead of a bare "Request timed out".
 *
 * The platform's llm-retry layer already retried whatever its policy
 * covers; what reaches `turn/end` is the post-retry failure. The user's
 * remaining moves are: wait the requested backoff, resend the same prompt,
 * or switch models — so the hint names the concrete next step per class.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/turn-failure
 */
/** The raw `reason.error` payload of a failed turn end. */
export interface TurnFailureLike {
    readonly message?: unknown;
    readonly code?: unknown;
    readonly status?: unknown;
    readonly providerRetryAfterMs?: unknown;
}
/** Classified failure with the guidance appended to the error notice. */
export interface TurnFailureHint {
    /** Stable class id. */
    readonly kind: 'rate-limit' | 'timeout' | 'server' | 'auth' | 'network' | 'effort-field' | 'model' | 'unknown';
    /** True when the class usually heals on its own after a wait. */
    readonly transient: boolean;
    /** Complete user-facing notice (error line + hint lines). */
    readonly text: string;
}
/** Classify a failed turn's error payload. */
export declare function classifyTurnFailure(error: TurnFailureLike | undefined, message: string): TurnFailureHint;
