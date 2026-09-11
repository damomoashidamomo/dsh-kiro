/**
 * `/agent` — manage custom agents. Phase 3 ships the listing + show subcommand
 * (read-only against the .kiro/agents/ directories), the create / edit /
 * delete writers land in phase 4.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const agentCommand: CommandDefinition;
