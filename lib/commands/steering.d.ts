import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * /steering — surface the ACTUAL loaded steering state: which .kiro/steering
 * directories were read, which files apply to this cwd (frontmatter
 * inclusion: always / conditional globs / manual), and the composed
 * system-prompt section size.
 */
export declare const steeringCommand: CommandDefinition;
