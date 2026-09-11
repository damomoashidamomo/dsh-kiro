/**
 * kiro-steering — discovers `.kiro/steering/*.md` and `~/.kiro/steering/*.md`,
 * parses each file's frontmatter, and publishes the resolved list on the
 * Cordis context so the runtime can inject them into the system prompt.
 *
 * @module @damomoashidamomo/dsh-kiro/steering
 */
import type { Context } from '@deepseek-ai/cordis';
/** Service identifier for the parsed steering-file list. */
export declare const KIRO_STEERING = "kiroSteering";
/** Stable Cordis plugin name. */
export declare const name = "kiro-steering";
/** Mount the loader. */
export declare function apply(ctx: Context): void;
export type { SteeringFile } from './loader';
