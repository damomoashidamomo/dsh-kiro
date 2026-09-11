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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const CHECKPOINT_DIR = '.kiro/checkpoints';
const INDEX_FILE = 'index.json';
function defaultShell() {
    return process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
}
/** Spawn one git command inside `cwd`, throwing on non-zero exit. */
function runGit(cwd, args) {
    const result = spawnSync('git', args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        // No shell: the `=` in `--git-dir=…` would otherwise be parsed by /bin/sh
        // and produce a different argv. Linux/macOS resolve `git` from PATH; on
        // Windows Node looks up `.cmd`/`.exe` siblings automatically.
    });
    if (result.error !== undefined) {
        throw new Error(`git ${args.join(' ')} failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} exited ${String(result.status)}: ${result.stderr}`);
    }
    return result.stdout;
}
/** Read the persisted checkpoint index or return an empty one. */
function readIndex(indexPath) {
    if (!existsSync(indexPath))
        return { version: 1, checkpoints: [] };
    try {
        const raw = JSON.parse(readFileSync(indexPath, 'utf8'));
        if (raw.version !== 1 || !Array.isArray(raw.checkpoints))
            return { version: 1, checkpoints: [] };
        return { version: 1, checkpoints: raw.checkpoints };
    }
    catch {
        return { version: 1, checkpoints: [] };
    }
}
/** Persist the checkpoint index. */
function writeIndex(indexPath, index) {
    mkdirSync(dirname(indexPath), { recursive: true });
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}
/**
 * Lightweight wrapper around a git shadow repository that backs the
 * `/checkpoint` slash command. Phase 5 ships the manager + restore path; the
 * auto-commit-on-turn-end hookup lands when the runtime gains a turn
 * observer.
 */
export class CheckpointManager {
    dir;
    gitDir;
    indexPath;
    workingTree;
    index;
    constructor(workingTree = process.cwd()) {
        this.workingTree = resolve(workingTree);
        this.dir = join(this.workingTree, CHECKPOINT_DIR);
        this.gitDir = join(this.dir, '.git');
        this.indexPath = join(this.dir, INDEX_FILE);
        this.index = readIndex(this.indexPath);
    }
    /** Absolute path to the shadow-repo directory. */
    get shadowDir() {
        return this.dir;
    }
    /** All known checkpoints, newest last. */
    list() {
        return this.index.checkpoints;
    }
    /** Whether the shadow repo has been initialized. */
    isInitialized() {
        return existsSync(this.gitDir);
    }
    /** Initialize the shadow repo. Idempotent. */
    init() {
        if (this.isInitialized())
            return;
        mkdirSync(this.dir, { recursive: true });
        runGit(this.dir, ['init']);
        runGit(this.dir, ['config', 'user.name', 'dsh-kiro']);
        runGit(this.dir, ['config', 'user.email', 'kiro@dsh.local']);
        runGit(this.dir, ['config', 'commit.gpgsign', 'false']);
        // .gitignore so the shadow dir ignores itself.
        writeFileSync(join(this.dir, '.gitignore'), 'index.json.lock\n', 'utf8');
        this.index = { version: 1, checkpoints: [] };
        this.writeIndex();
    }
    /**
     * Snapshot the current working tree state. Returns the new checkpoint.
     * @param label - optional human-readable label.
     */
    snapshot(label) {
        this.init();
        // Use the working tree as cwd so git reads files from there, but write
        // the snapshot into the shadow repo via `git --git-dir=<shadow>/.git`.
        const shadowRelative = relative(this.workingTree, this.dir);
        const shadowPattern = shadowRelative !== '' ? `${shadowRelative}/` : '';
        const excludesPath = join(this.dir, '.git', 'info', 'exclude');
        let excludesContent = '';
        if (existsSync(excludesPath))
            excludesContent = readFileSync(excludesPath, 'utf8');
        if (shadowPattern !== '' && !excludesContent.includes(shadowPattern)) {
            writeFileSync(excludesPath, `${excludesContent}${shadowPattern}\n`, 'utf8');
        }
        const gitDirFlag = `--git-dir=${join(this.dir, '.git')}`;
        runGit(this.workingTree, [gitDirFlag, 'add', '-A']);
        const status = runGit(this.workingTree, [gitDirFlag, 'status', '--porcelain']);
        if (status.trim() === '') {
            const last = this.index.checkpoints[this.index.checkpoints.length - 1];
            if (last !== undefined)
                return last;
        }
        const message = label ?? `checkpoint @ ${new Date().toISOString()}`;
        runGit(this.workingTree, [gitDirFlag, 'commit', '--no-verify', '-m', message]);
        const hash = runGit(this.workingTree, [gitDirFlag, 'rev-parse', 'HEAD']).trim();
        const nextId = (this.index.checkpoints[this.index.checkpoints.length - 1]?.id ?? 0) + 1;
        const ref = `refs/kiro/checkpoints/${nextId.toString()}`;
        runGit(this.dir, ['update-ref', ref, hash]);
        const checkpoint = {
            id: nextId,
            ref,
            createdAt: Date.now(),
            label: label ?? '',
            shortHash: hash.slice(0, 8),
            hash,
        };
        this.index = { version: 1, checkpoints: [...this.index.checkpoints, checkpoint] };
        this.writeIndex();
        return checkpoint;
    }
    /** Restore the working tree to a checkpoint by id (1-based). */
    restore(id) {
        const target = this.index.checkpoints.find((cp) => cp.id === id);
        if (target === undefined)
            throw new Error(`no checkpoint with id ${id.toString()}`);
        const gitDirFlag = `--git-dir=${join(this.dir, '.git')}`;
        const workTreeFlag = `--work-tree=${this.workingTree}`;
        runGit(this.workingTree, [gitDirFlag, workTreeFlag, 'read-tree', '--reset', '-u', target.hash]);
        return target;
    }
    /** Print a unified diff between two checkpoints (or working tree). */
    diff(from, to) {
        const a = this.index.checkpoints.find((cp) => cp.id === from);
        const b = this.index.checkpoints.find((cp) => cp.id === to);
        if (a === undefined)
            throw new Error(`no checkpoint ${from.toString()}`);
        if (b === undefined)
            throw new Error(`no checkpoint ${to.toString()}`);
        const gitDirFlag = `--git-dir=${join(this.dir, '.git')}`;
        const workTreeFlag = `--work-tree=${this.workingTree}`;
        return runGit(this.workingTree, [gitDirFlag, workTreeFlag, 'diff', a.hash, b.hash]);
    }
    /** Remove the shadow repo and the index file. */
    clean() {
        if (!existsSync(this.dir))
            return;
        spawnSync('rm', ['-rf', this.dir], { stdio: 'pipe', shell: defaultShell() });
        this.index = { version: 1, checkpoints: [] };
    }
    /** Persist the current index. */
    writeIndex() {
        writeIndex(this.indexPath, this.index);
    }
}
//# sourceMappingURL=manager.js.map