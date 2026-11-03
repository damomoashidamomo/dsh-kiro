/**
 * Rust engine bridge (P2): spawn `kiro-toold` per tool call — fresh process,
 * fresh Landlock restriction to the workspace root + /tmp, one JSON line in,
 * one JSON line out, hard process kill on timeout. Spawning per call (rather
 * than a long-lived daemon) is deliberate: each call gets a clean, minimal
 * kernel-level sandbox and a crash can never poison the next call.
 *
 * The binary lives at engine/target/release/kiro-toold (pnpm build:engine).
 * When absent, callers fall back to the platform tool pipeline.
 *
 * @module @damomoashidamomo/dsh-kiro/engine/bridge
 */
/** One engine tool call. */
export interface EngineCall {
    readonly tool: 'execute_bash' | 'fs_read' | 'fs_write';
    readonly args: Record<string, unknown>;
}
/** Engine reply: ok carries the tool's own result object. */
export interface EngineReply {
    readonly ok: boolean;
    readonly result?: Record<string, unknown>;
    readonly error?: string;
}
/**
 * Locate the engine binary (looked up once per process). Two candidates:
 * the repo layout (engine/ beside the cwd, dev + tests) and the installed
 * package layout (engine/ beside lib/). import.meta.url must go through
 * fileURLToPath — existsSync does not accept file:// URL STRINGS, which
 * silently disabled the installed-package path (the Rust engine never
 * actually ran from a deployed profile until this was fixed).
 */
export declare function engineBinary(): string | undefined;
/** Map a platform tool name + args onto the engine's tool surface. */
export declare function toEngineCall(name: string, args: unknown): EngineCall | undefined;
/** Run one call through a freshly sandboxed engine process. */
export declare function runEngineCall(call: EngineCall, workspaceRoot: string, timeoutMs?: number): Promise<EngineReply>;
