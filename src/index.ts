/**
 * dsh-kiro package entry — re-exports the public API surface. The Cordis
 * plugins themselves live in their own modules and are loaded by name from
 * the `cordis.patch.yml` insert list.
 *
 * @module @damomoashidamomo/dsh-kiro
 */

export { name, inject, apply } from './startup'
export type { KiroStartup, TrustList } from './startup'
export { banner, palette, ICONS } from './theme/palette'
export type { Palette, IconName } from './theme/palette'
export { BANNER } from './theme/banner'
export { ALL_COMMANDS, groupCommands, findCommand } from './commands/registry'
export { SessionController } from './runtime/session-controller'
export type { StateListener } from './runtime/session-controller'
export type {
  MessageKind,
  ToolState,
  ToolRecord,
  Message,
  AgentStatusSnapshot,
  OverlayKind,
  SessionRenderState,
  SessionEventPayload,
  Transcript,
} from './runtime/types'
export { mapKey, CHEAT_SHEET } from './runtime/keybindings'
export type { KeyAction, RawKey } from './runtime/keybindings'
export {
  applyOutcome,
  detectPrefix,
  emptyBuffer,
  isSlashReady,
  isAtReady,
  isShellReady,
  queueImage,
} from './runtime/input'
export type { InputOutcome, PendingImage, PromptBuffer } from './runtime/input'
export { renderMarkdown, renderInline_ } from './markdown/render'
