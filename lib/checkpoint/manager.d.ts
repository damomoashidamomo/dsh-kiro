/**
 * dsh-kiro checkpoint manager. Maintains a git shadow repository under
 * `.kiro/checkpoints/` whose refs track the working tree state at every
 * `/checkpoint init` and on every turn end.
 *
 * Each checkpoint is a single commit on `refs/kiro/checkpoints/<seq>` so the
 * workspace can be restored without polluting the user's own git history.
 *
 * @module @damomoashidamomo/dsh-kiro/checkpoint/manager
 */
/** A single recorded checkpoint. */
export interface Checkpoint {
    /** Sequential id (1-based, monotonic). */
    readonly id: number;
    /** Git ref that pins the snapshot. */
    readonly ref: string;
    /** Wall-clock timestamp (epoch ms). */
    readonly createdAt: number;
    /** Human-readable label the user supplied (or auto-generated). */
    readonly label: string;
    /** Stable short hash for display. */
    readonly shortHash: string;
    /** Full hash. */
    readonly hash: string;
}
/**
 * Lightweight wrapper around a git shadow repository that backs the
 * `/checkpoint` slash command. Phase 5 ships the manager + restore path; the
 * auto-commit-on-turn-end hookup lands when the runtime gains a turn
 * observer.
 */
export declare class CheckpointManager {
    private readonly dir;
    private readonly gitDir;
    private readonly indexPath;
    private readonly workingTree;
    private index;
    constructor(workingTree?: string);
    /** Absolute path to the shadow-repo directory. */
    get shadowDir(): string;
    /** All known checkpoints, newest last. */
    list(): readonly Checkpoint[];
    /** Whether the shadow repo has been initialized. */
    isInitialized(): boolean;
    /** Initialize the shadow repo. Idempotent. */
    init(): void;
    /**
     * Snapshot the current working tree state. Returns the new checkpoint.
     * @param label - optional human-readable label.
     */
    snapshot(label?: string): Checkpoint;
    /** Restore the working tree to a checkpoint by id (1-based). */
    restore(id: number): Checkpoint;
    /** Print a unified diff between two checkpoints (or working tree). */
    diff(from: number, to: number): string;
    /** Remove the shadow repo and the index file. */
    clean(): void;
    /** Persist the current index. */
    private writeIndex;
}
