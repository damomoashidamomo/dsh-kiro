/**
 * kiro-commands — register every slash command from the dsh-kiro catalog.
 *
 * Commands registered here are global (the TUI is single-session), so a host
 * row in the patch is the right place. Phase 3 will fill in real handlers;
 * today each unknown one returns a polite "phase 3+" stub via `stubCommand`.
 *
 * @module @damomoashidamomo/dsh-kiro/commands
 */
import { ALL_COMMANDS } from './registry.js';
/** Stable Cordis plugin name. */
export const name = 'kiro-commands';
/** Core services required for slash dispatch. */
export const inject = ['commands'];
/** Register every slash command. */
export function apply(ctx) {
    const commands = ctx.get('commands');
    if (commands === undefined) {
        throw new Error('kiro-commands: ctx.commands is not available; the base layer must mount dsh-commands first');
    }
    for (const command of ALL_COMMANDS) {
        commands.register(command);
    }
}
//# sourceMappingURL=index.js.map