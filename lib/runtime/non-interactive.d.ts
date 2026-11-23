/**
 * kiro-non-interactive — the `--no-interactive` output surface.
 *
 * 0.9.10 found the flag itself was dead (see the startup fix), and that even
 * once it routes, the runtime exited without printing the answer: `-f plain`
 * produced empty stdout. That silently broke the A3 headless fallback
 * (`src/dsh-adapter/headless-llm.ts` spawns exactly this command line and reads
 * stdout as the model reply), so the escape hatch could never have worked.
 *
 * This module owns the answer extraction and the three output formats so both
 * halves are unit-testable without booting Ink.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/non-interactive
 */
import type { Message } from './types';
/** Output formats accepted by `-f/--format`. */
export type NonInteractiveFormat = 'plain' | 'json' | 'json-pretty';
/** One tool invocation summarized for JSON consumers. */
export interface NonInteractiveToolCall {
    readonly name: string;
    readonly state: string;
}
/** Machine-readable non-interactive payload. */
export interface NonInteractiveReport {
    /** Final assistant text, joined across settled assistant messages. */
    readonly text: string;
    /**
     * Driver-level turn failure (provider 429, auth, model id…). A failed turn
     * yields no assistant text, so without this a caller cannot tell "empty
     * answer" from "the turn never produced one".
     */
    readonly failure?: string | undefined;
    /** Tool calls the turn made, in order. */
    readonly toolCalls: readonly NonInteractiveToolCall[];
    /** Runtime error messages (kind 'error'), if the turn failed. */
    readonly errors: readonly string[];
}
/**
 * Extract the turn's answer.
 *
 * Only `assistant` messages contribute text: system notices, reasoning and
 * tool output are diagnostics, not the answer. Streaming segments are included
 * (a non-interactive turn ends when idle, so whatever is left is final).
 */
export declare function collectNonInteractiveReport(messages: readonly Message[], failure?: string | undefined): NonInteractiveReport;
/**
 * Format the report for stdout.
 *
 * `plain` prints the answer alone — that is what the headless fallback and any
 * shell pipeline wants. The JSON formats wrap it so scripts keep the tool trace.
 */
export declare function formatNonInteractiveReport(report: NonInteractiveReport, format?: NonInteractiveFormat): string;
/**
 * Whether a non-interactive turn should exit non-zero: it produced no answer
 * and something failed. A turn that answered does not fail even if a tool
 * errored along the way.
 */
export declare function nonInteractiveFailed(report: NonInteractiveReport): boolean;
/** Human-readable failure lines for stderr. */
export declare function nonInteractiveFailureLines(report: NonInteractiveReport): readonly string[];
