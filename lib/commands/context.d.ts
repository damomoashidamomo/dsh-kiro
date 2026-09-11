/**
 * `/context` — manage the persistent context files that the agent sees
 * alongside the user's prompt.
 *
 * Phase 3 ships the listing and helper commands. The `add` / `remove`
 * writers land in phase 4 once the file-reference provider is wired up.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const contextCommand: CommandDefinition;
