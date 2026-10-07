/**
 * kiro-steering — discovers `.kiro/steering/*.md` and `~/.kiro/steering/*.md`,
 * parses each file's frontmatter, and publishes the resolved list on the
 * Cordis context so the runtime can inject them into the system prompt.
 *
 * @module @damomoashidamomo/dsh-kiro/steering
 */
import type { Context } from '@deepseek-ai/cordis';
import { type SteeringFile } from './loader';
/** Service identifier for the parsed steering-file list. */
export declare const KIRO_STEERING = "kiroSteering";
/** Stable Cordis plugin name. */
export declare const name = "kiro-steering";
/** Compose the system-prompt payload from the applicable files. */
export declare function composeSteeringPrompt(applicable: readonly SteeringFile[]): string;
/** Module-level snapshot for command handlers (they cannot reach ctx). */
declare let steeringState: {
    files: readonly SteeringFile[];
    applicable: readonly SteeringFile[];
    sectionChars: number;
} | undefined;
/** Latest loaded steering state, for /steering. */
export declare function getKiroSteering(): typeof steeringState;
/** Mount the loader and inject the guidance as a system-prompt section. */
export declare function apply(ctx: Context): void;
export type { SteeringFile } from './loader';
