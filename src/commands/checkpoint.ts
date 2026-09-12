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

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { Checkpoint, CheckpointManager } from '../checkpoint/manager'

interface CheckpointService {
  init(): void
  snapshot(label?: string): Checkpoint
  list(): readonly Checkpoint[]
  diff(from: number, to: number): string
  restore(id: number): Checkpoint
  clean(): void
  isInitialized(): boolean
  shadowDir: string
}

function parseSubcommand(input: string): { name: string; args: string[] } {
  const trimmed = input.trim()
  if (trimmed === '') return { name: 'list', args: [] }
  const tokens = trimmed.split(/\s+/u)
  return { name: tokens[0] ?? 'list', args: tokens.slice(1) }
}

/** Resolve `kiroCheckpoint` from the agent's context, or fail with a message. */
function resolveService(agentCtx: unknown): CheckpointService | { error: string } {
  if (agentCtx === null || typeof agentCtx !== 'object') {
    return { error: 'agent context is not available' }
  }
  const get = (agentCtx as { get?: (name: string) => unknown }).get
  if (typeof get !== 'function') {
    return { error: 'agent context does not expose a get() method' }
  }
  const svc = get.call(agentCtx, 'kiroCheckpoint')
  if (svc === undefined) {
    return { error: 'kiroCheckpoint service is not mounted; run /checkpoint init first' }
  }
  return svc as CheckpointManager as CheckpointService
}

/** Parse a positive integer argument; returns `undefined` on failure. */
function parsePositiveInt(s: string | undefined): number | undefined {
  if (s === undefined) return undefined
  const n = Number.parseInt(s, 10)
  if (!Number.isFinite(n) || n <= 0 || String(n) !== s) return undefined
  return n
}

/** Render the checkpoint listing as a compact table. */
function listText(checkpoints: readonly Checkpoint[]): string {
  if (checkpoints.length === 0) {
    return '(no checkpoints — use /checkpoint init then /checkpoint snapshot [label])'
  }
  const lines: string[] = [`${checkpoints.length.toString().padStart(3)} checkpoint(s):`]
  const width = Math.max(...checkpoints.map((cp) => cp.id.toString().length))
  for (const cp of checkpoints) {
    const id = cp.id.toString().padStart(width, ' ')
    const date = new Date(cp.createdAt).toISOString().replace('T', ' ').slice(0, 16)
    const label = cp.label === '' ? '' : `  ${cp.label}`
    lines.push(`  #${id}  ${cp.shortHash}  ${date}${label}`)
  }
  return lines.join('\n')
}

export const checkpointCommand: CommandDefinition = {
  name: 'checkpoint',
  description: 'Workspace snapshots — init, snapshot, list, diff, restore, clean',
  input: { hint: '<init|snapshot|list|diff|restore|clean> [args]' },
  handler: async ({ agent, rawInput }) => {
    const { name: sub, args } = parseSubcommand(rawInput)
    const ctx = (agent as unknown as { ctx?: unknown }).ctx
    const svc = resolveService(ctx)

    if ('error' in svc) {
      // /checkpoint init is the only command that makes sense before the
      // service exists; let it through.
      if (sub !== 'init') return { kind: 'error', text: svc.error }
      return { kind: 'error', text: svc.error }
    }

    switch (sub) {
      case 'init': {
        try {
          svc.init()
          return {
            kind: 'success',
            text: `checkpoint shadow repo initialized at ${svc.shadowDir}`,
          }
        } catch (error: unknown) {
          return {
            kind: 'error',
            text: `failed to init checkpoint repo: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      }
      case 'snapshot': {
        try {
          const label = args.join(' ').trim()
          const cp = svc.snapshot(label === '' ? undefined : label)
          return {
            kind: 'success',
            text: `checkpoint #${cp.id.toString()} created (${cp.shortHash})${cp.label !== '' ? ` — ${cp.label}` : ''}`,
          }
        } catch (error: unknown) {
          return {
            kind: 'error',
            text: `failed to snapshot: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      }
      case 'list':
      case '': {
        const checkpoints = svc.list()
        return { kind: 'success', text: listText(checkpoints) }
      }
      case 'diff': {
        const a = parsePositiveInt(args[0])
        const b = parsePositiveInt(args[1])
        if (a === undefined || b === undefined) {
          return { kind: 'success', text: 'usage: /checkpoint diff <from-id> <to-id>' }
        }
        try {
          const out = svc.diff(a, b)
          if (out.trim() === '') return { kind: 'success', text: '(no changes between these checkpoints)' }
          // Cap output to keep the TUI responsive.
          const lines = out.split('\n')
          const truncated = lines.length > 200
          const body = truncated ? lines.slice(0, 200).join('\n') + `\n… (${lines.length - 200} more lines)` : out
          return { kind: 'success', text: body }
        } catch (error: unknown) {
          return {
            kind: 'error',
            text: error instanceof Error ? error.message : String(error),
          }
        }
      }
      case 'restore': {
        const id = parsePositiveInt(args[0])
        if (id === undefined) {
          return { kind: 'success', text: 'usage: /checkpoint restore <id> [--force]' }
        }
        const force = args.includes('--force')
        if (!force) {
          return {
            kind: 'error',
            text:
              `restore overwrites the working tree; pass --force to confirm\n`
              + `  example: /checkpoint restore ${id.toString()} --force`,
          }
        }
        try {
          const cp = svc.restore(id)
          return {
            kind: 'success',
            text: `restored working tree to checkpoint #${cp.id.toString()} (${cp.shortHash})`,
          }
        } catch (error: unknown) {
          return {
            kind: 'error',
            text: error instanceof Error ? error.message : String(error),
          }
        }
      }
      case 'clean': {
        svc.clean()
        return {
          kind: 'success',
          text: `removed checkpoint shadow repo at ${svc.shadowDir}`,
        }
      }
      case 'help':
        return {
          kind: 'success',
          text: [
            '/checkpoint init                          initialize the shadow repo',
            '/checkpoint snapshot [label]              snapshot the working tree',
            '/checkpoint list                            list every checkpoint',
            '/checkpoint diff <from-id> <to-id>          show changes between two snapshots',
            '/checkpoint restore <id> [--force]         reset the working tree to <id>',
            '/checkpoint clean                           delete the shadow repo',
          ].join('\n'),
        }
      default:
        return { kind: 'success', text: `unknown subcommand: ${sub}. Try /checkpoint help.` }
    }
  },
}

export { listText }