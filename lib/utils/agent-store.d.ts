/**
 * Custom-agent store — the `.dsh-kiro/agents/*.json` files kiro-cli reads.
 *
 * Project scope wins over user scope, the same precedence kiro-cli uses. The
 * write operations (create / rename / delete / validate) live here as pure
 * functions over a pair of directories so tests can run against a temp tree
 * instead of the user's `~/.dsh-kiro/agents`.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/agent-store
 */
/** Project dir first, user dir second — lookup order matters. */
export declare function agentDirs(cwd?: string, home?: string): {
    project: string;
    user: string;
};
export interface AgentSummary {
    readonly name: string;
    readonly source: 'project' | 'user';
    readonly path: string;
    readonly description: string;
}
/** List every agent definition, project scope first. */
export declare function listAgents(dirs?: {
    project: string;
    user: string;
}): AgentSummary[];
/** The file an agent name lives in, or undefined. Project scope wins. */
export declare function findAgent(dirs: ReturnType<typeof agentDirs>, name: string): AgentSummary | undefined;
/** The kiro-shaped template a new agent starts from (kiro-cli field parity). */
export declare function agentTemplate(name: string, description: string, prompt: string | null): string;
/** Create `<user-dir>/<name>.json` from the template; refuses an existing file. */
export declare function createAgent(dirs: ReturnType<typeof agentDirs>, name: string, description?: string, prompt?: string | null): {
    path: string;
};
/** Rename: rewrite the file's `name` field and move it. */
export declare function renameAgent(dirs: ReturnType<typeof agentDirs>, from: string, to: string): {
    path: string;
};
/** Delete an agent definition file. */
export declare function deleteAgent(dirs: ReturnType<typeof agentDirs>, name: string): {
    path: string;
};
/** A definition is valid when it parses and carries a non-empty name. */
export declare function validateAgentFile(path: string): {
    ok: true;
    name: string;
} | {
    ok: false;
    reason: string;
};
/** 引擎绑定（dsh-kiro 私有，存工作区 `.dsh-kiro/agent-engines.json`）。 */
export interface EngineBinding {
    readonly engine: 'kiro' | 'dsh';
    readonly toolEngine?: 'rust' | 'dsh';
}
/** 某 agent 的引擎绑定：用户级优先，其次从 cwd 向上找到的最近一份。 */
export declare function getEngineBinding(cwd: string, name: string): EngineBinding | undefined;
/** 写入/更新引擎绑定（固定写用户级文件）。 */
export declare function setEngineBinding(_cwd: string, name: string, binding: EngineBinding): void;
/** 清除某 agent 的引擎绑定（用户级与沿途工作区文件都清）。 */
export declare function clearEngineBinding(cwd: string, name: string): boolean;
/** 启动默认 agent（用户级优先，其次向上遍历），未设置返回 undefined。 */
export declare function getDefaultAgent(cwd: string): string | undefined;
/** 设置启动默认 agent（固定写用户级文件）。 */
export declare function setDefaultAgent(_cwd: string, name: string): void;
