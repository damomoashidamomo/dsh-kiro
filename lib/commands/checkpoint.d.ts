/**
 * `/checkpoint` — workspace snapshots via a git shadow repo.
 *
 * Backed by the `kiroCheckpoint` service (provided by the `kiro-checkpoint`
 * Cordis plugin). The service maintains `.kiro/checkpoints/` as a git
 * repository with one ref per checkpoint; the user's own git history
 * stays untouched.
 *
 * Subcommands:
 *   init                  create the shadow repo (idempotent)
 *   snapshot [label]      record the current working tree state
 *   list                  show every checkpoint, newest last
 *   diff <a> <b>          unified diff between two checkpoint ids
 *   restore <id> [--force]  reset the working tree to checkpoint <id>;
 *                         refuses without --force to protect uncommitted work
 *   clean                 delete the shadow repo (irreversible)
 *
 * The auto-snapshot-on-turn-end hookup lives in the runtime; this command
 * only drives the on-demand surface.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { Checkpoint } from '../checkpoint/manager';
/** Render the checkpoint listing as a compact table. */
declare function listText(checkpoints: readonly Checkpoint[]): string;
export declare const checkpointCommand: CommandDefinition;
export { listText };
