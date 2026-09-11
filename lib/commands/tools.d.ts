/**
 * `/tools` — list every built-in tool, show current trust status, and mutate
 * the trust store (trust / untrust / reset).
 *
 * Implementation note: phase 3 only mutates the TrustStore; the agent's
 * `agent/pre-step` interception that enforces trust lands in phase 4. Until
 * then the store records the user's intent and surfaces it back to them.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const toolsCommand: CommandDefinition;
