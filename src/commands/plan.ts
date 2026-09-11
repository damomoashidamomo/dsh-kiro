import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

/**
 * `/plan` — toggle plan mode. Phase 3 is a no-op placeholder; phase 4 wires
 * `ctx.provide('planMode', …)` and the kiro-plan plugin short-circuits the
 * agent loop until the user approves the plan.
 */
export const planCommand: CommandDefinition = {
  name: 'plan',
  description: 'Toggle plan mode — explore without modifying code, then approve the plan',
  handler: async () => {
    return {
      kind: 'success',
      text: 'plan mode toggle lands in phase 4 (the kiro-plan plugin will compose with `dsh-plan-mode`).',
    }
  },
}
