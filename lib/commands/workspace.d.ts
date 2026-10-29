import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * /workspace — show the session workspace (fixed at agent creation; all
 * tools and the sandbox anchor to it). Switching workspaces = launching
 * dsh in another directory (new session).
 */
export declare const workspaceCommand: CommandDefinition;
