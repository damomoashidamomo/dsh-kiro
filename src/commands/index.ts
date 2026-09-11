/**
 * kiro-commands — register every slash command from the dsh-kiro catalog.
 *
 * Commands registered here are global (the TUI is single-session), so a host
 * row in the patch is the right place. dsh-base rows that already own a name
 * (`/plan` from dsh-plan-mode, `/compact` from dsh-command-compact) keep it:
 * those are real implementations wired into the session machinery, while the
 * kiro catalog entries for the same names are phase-3 stubs. Everything else
 * in the catalog is registered here.
 *
 * @module @damomoashidamomo/dsh-kiro/commands
 */

import type { Context } from '@deepseek-ai/cordis'
import { ALL_COMMANDS } from './registry'

/** Stable Cordis plugin name. */
export const name = 'kiro-commands'

/** Core services required for slash dispatch. */
export const inject = ['commands']

/**
 * Command names owned by dsh-base rows. The base implementations (/plan from
 * dsh-plan-mode, /compact from dsh-command-compact) are real and wired into
 * the session machinery, while the kiro catalog entries for the same names are
 * phase-3 stubs — so these are never registered here. The loader mounts rows
 * concurrently, so a "skip if already registered" check is not enough: the
 * base row may register the name after us and then fail. Excluding the name
 * outright makes the base row the sole owner.
 */
const BASE_OWNED_NAMES = new Set(['plan', 'compact'])

/** Register every slash command whose name is not owned by the base layer. */
export function apply(ctx: Context): void {
  const commands = ctx.get('commands')
  if (commands === undefined) {
    throw new Error('kiro-commands: ctx.commands is not available; the base layer must mount dsh-commands first')
  }
  let skipped = 0
  for (const command of ALL_COMMANDS) {
    if (BASE_OWNED_NAMES.has(command.name)) {
      skipped += 1
      continue
    }
    try {
      commands.register(command)
    } catch {
      // Defensive: another row won the name first (e.g. a future base row).
      // Keep the already-registered implementation.
      skipped += 1
    }
  }
  if (skipped > 0) {
    ctx.logger('kiro-commands').info(`skipped ${skipped} command(s) already owned by the base layer`)
  }
}
