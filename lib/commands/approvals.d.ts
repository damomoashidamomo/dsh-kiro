import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * /approvals — manage persisted + session trust: whole tools and the finer
 * command/prefix patterns chosen in the approval panel's scope selector.
 *   /approvals                     list everything
 *   /approvals remove <kind> <n>   remove one entry
 *     kinds: project-tool | project-pattern | session-pattern
 */
export declare const approvalsCommand: CommandDefinition;
