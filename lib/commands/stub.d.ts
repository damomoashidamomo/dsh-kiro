/**
 * Helper for stub commands that ship a real description and a `not implemented
 * yet` response so the slash menu remains complete from day one.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * Construct a placeholder command whose handler prints a polite message
 * pointing the user at the implementation status. Used during phase 1 so
 * `registry.ts` compiles end-to-end; phase 3 swaps real handlers in.
 */
export declare function stubCommand(name: string, description: string, hint?: string): CommandDefinition;
