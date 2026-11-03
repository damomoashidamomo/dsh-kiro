/**
 * kiro-skills — the dsh-kiro provider for the platform's `ctx.skills`
 * registry: discovers SKILL.md bundles across kiro/dsh/agents roots
 * (project + user level), applies the workspace's selection file
 * (`.kiro/skills.json`, default ALL enabled), and exposes the selection
 * service the `/skills` command drives.
 *
 * Selective loading works at the PROVIDER level: disabled skills are never
 * listed as candidates, so neither the model-facing catalog (the `skill`
 * tool's advertisement, dsh-tool-skill) nor user commands ever see them.
 *
 * @module @damomoashidamomo/dsh-kiro/skills
 */
import type { Context } from '@deepseek-ai/cordis';
/** Service id for the selection surface. */
export declare const KIRO_SKILL_SELECTION = "kiroSkillSelection";
/** Stable Cordis plugin name. */
export declare const name = "kiro-skills";
/** The skills registry must exist before we can register the provider. */
export declare const inject: string[];
/** Mount: register the provider + expose the selection service. */
export declare function apply(ctx: Context): void;
