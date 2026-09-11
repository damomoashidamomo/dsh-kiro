/**
 * dsh-kiro package entry — re-exports the public API surface. The Cordis
 * plugins themselves live in their own modules and are loaded by name from
 * the `cordis.patch.yml` insert list.
 *
 * @module @damomoashidamomo/dsh-kiro
 */
export { name, inject, apply } from './startup.js';
export { banner, palette, ICONS } from './theme/palette.js';
export { BANNER } from './theme/banner.js';
export { ALL_COMMANDS, groupCommands, findCommand } from './commands/registry.js';
export { SessionController } from './runtime/session-controller.js';
export { mapKey, CHEAT_SHEET } from './runtime/keybindings.js';
export { applyOutcome, detectPrefix, emptyBuffer, isSlashReady, isAtReady, isShellReady, queueImage, } from './runtime/input.js';
export { renderMarkdown, renderInline_ } from './markdown/render.js';
//# sourceMappingURL=index.js.map