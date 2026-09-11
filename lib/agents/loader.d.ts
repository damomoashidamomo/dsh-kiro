/**
 * dsh-kiro custom-agents loader. Reads `.kiro/agents/*.json` and
 * `~/.kiro/agents/*.json`, validates each against the kiro agent schema, and
 * exposes them through a registry the runtime can consult.
 *
 * @module @damomoashidamomo/dsh-kiro/agents/loader
 */
/** Source location of an agent config. */
export type AgentSource = 'project' | 'user';
/** Allowed/denied tool lists. */
export interface AgentToolPolicy {
    readonly allow?: readonly string[];
    readonly deny?: readonly string[];
}
/** MCP server entry embedded in an agent config. */
export interface AgentMcpServer {
    readonly name: string;
    readonly command?: string;
    readonly args?: readonly string[];
    readonly url?: string;
    readonly env?: Record<string, string>;
}
/** Resolved custom-agent record. */
export interface AgentConfig {
    readonly name: string;
    readonly description: string;
    readonly source: AgentSource;
    readonly path: string;
    /** Provider/model the agent selects by default. */
    readonly model?: string;
    /** System prompt the agent mounts. */
    readonly systemPrompt?: string;
    /** Tool allow/deny list. */
    readonly tools: AgentToolPolicy;
    /** Steering files to inject. */
    readonly steeringFiles: readonly string[];
    /** MCP servers required by this agent. */
    readonly mcpServers: readonly AgentMcpServer[];
    /** Whether the agent can spawn subagents. */
    readonly allowSubagents: boolean;
    /** Reasoning-effort override. */
    readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    /** Mode override. */
    readonly mode?: 'vibe' | 'spec';
    /** Free-form extras preserved for the runtime to interpret. */
    readonly raw: Record<string, unknown>;
}
/** Parse and validate one agent config object. Throws on invalid input. */
export declare function parseAgentConfig(raw: unknown, source: AgentSource, path: string): AgentConfig;
/** Walk the well-known agent directories and parse every JSON file. */
export declare function loadAgentConfigs(): AgentConfig[];
