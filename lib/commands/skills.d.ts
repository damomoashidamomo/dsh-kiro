/**
 * `/skills` — selective skill loading (kiro-cli parity, like /model for
 * models): list every discovered SKILL.md across kiro/dsh/agents roots with
 * its on/off state, toggle per name, persisted in `.kiro/skills.json`.
 * Disabled skills never enter the model-facing catalog (the `skill` tool)
 * because the kiro provider filters at listing time.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/skills
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const skillsCommand: CommandDefinition;
