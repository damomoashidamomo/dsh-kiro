/**
 * kiro-agents — discovers `.kiro/agents/*.json` and `~/.kiro/agents/*.json`,
 * parses each into a typed {@link AgentConfig}, and publishes the list on the
 * Cordis context so the runtime and `/agent` commands can introspect them.
 *
 * Phase 4 stops at discovery + inspection; phase 5 wires live agent creation
 * against `agents.create()` with the resolved tools / system prompt overrides.
 *
 * @module @damomoashidamomo/dsh-kiro/agents
 */

import type { Context } from '@deepseek-ai/cordis'
import { loadAgentConfigs, type AgentConfig } from './loader'

/** Service identifier for the parsed custom-agent list. */
export const KIRO_AGENTS = 'kiroAgents'

/** Stable Cordis plugin name. */
export const name = 'kiro-agents'

/** Mount the loader. */
export function apply(ctx: Context): void {
  const agents = loadAgentConfigs()
  ctx.provide(KIRO_AGENTS, agents)
  ctx.logger.info?.(`dsh-kiro: kiro-agents mounted (${agents.length} custom agent(s) discovered)`)
}

export type { AgentConfig } from './loader'
