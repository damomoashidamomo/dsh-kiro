import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * `/plan` — toggle plan mode. Phase 3 is a no-op placeholder; phase 4 wires
 * `ctx.provide('planMode', …)` and the kiro-plan plugin short-circuits the
 * agent loop until the user approves the plan.
 */
export declare const planCommand: CommandDefinition;
