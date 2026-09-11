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
import type { Context } from '@deepseek-ai/cordis';
/** Service identifier for the parsed custom-agent list. */
export declare const KIRO_AGENTS = "kiroAgents";
/** Stable Cordis plugin name. */
export declare const name = "kiro-agents";
/** Mount the loader. */
export declare function apply(ctx: Context): void;
export type { AgentConfig } from './loader';
