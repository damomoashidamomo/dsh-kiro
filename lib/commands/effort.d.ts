import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * `/effort` — set the reasoning depth the agent loop sends with every
 * request. Real wiring: persists through agentDefaultModel (survives
 * restarts) and live-applies through the same model-selection override
 * /model uses (next request). Levels are validated against the model's
 * DECLARED efforts — models without declarations report honestly instead
 * of accepting a dial they cannot turn.
 */
export declare const effortCommand: CommandDefinition;
