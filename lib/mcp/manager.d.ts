/**
 * dsh-kiro MCP manager. Reads `.kiro/settings/mcp.json` + `~/.kiro/settings/mcp.json`,
 * normalizes each entry into a typed server config, and exposes a status table
 * the runtime and `/mcp` command surface can render.
 *
 * Phase 4 ships the config reader + status table; phase 5 wires live stdio/SSE
 * spawning through `@modelcontextprotocol/sdk` once the runtime owns a process
 * boundary for each entry.
 *
 * @module @damomoashidamomo/dsh-kiro/mcp/manager
 */
/** Connection transport for an MCP server entry. */
export type McpTransport = 'stdio' | 'sse' | 'http';
/** Normalized MCP server configuration. */
export interface McpServerConfig {
    readonly name: string;
    readonly transport: McpTransport;
    readonly command?: string;
    readonly args: readonly string[];
    readonly url?: string;
    readonly env: Record<string, string>;
    readonly source: 'project' | 'user';
    readonly path: string;
}
/** Live runtime status of one MCP server. */
export interface McpServerStatus {
    readonly config: McpServerConfig;
    /** Whether the manager has tried to start this server. */
    readonly started: boolean;
    /** `ok` once a successful handshake completes. */
    readonly state: 'configured' | 'starting' | 'ok' | 'error';
    /** Tool names the server has advertised (once `started`). */
    readonly tools: readonly string[];
    /** Error message when `state === 'error'`. */
    readonly error?: string;
}
/** Read every MCP server config from the well-known locations. */
export declare function loadMcpConfigs(): McpServerConfig[];
/** Read-only manager exposed to the runtime and `/mcp` command. */
export declare class McpManager {
    private readonly statuses;
    constructor();
    /** All known servers (including not-yet-started ones). */
    list(): readonly McpServerStatus[];
    /** Look up one server by name. */
    get(name: string): McpServerStatus | undefined;
    /** Mark a server as starting. */
    markStarting(name: string): void;
    /** Mark a server as ok with the tool list advertised by the handshake. */
    markOk(name: string, tools: readonly string[]): void;
    /** Mark a server as errored. */
    markError(name: string, error: string): void;
}
