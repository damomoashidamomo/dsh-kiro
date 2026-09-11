/**
 * dsh-kiro keybinding catalogue. Exposes named actions so the Ink renderer
 * can dispatch a uniform shape, and the test suite can simulate keys
 * without coupling to actual `useInput` calls.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/keybindings
 */
import type { Key } from 'ink';
/** A high-level keybinding action. */
export type KeyAction = 'submit' | 'newline' | 'interrupt' | 'quit' | 'open-slash-menu' | 'open-agent-picker' | 'open-model-picker' | 'open-context-picker' | 'open-tool-trust' | 'open-mcp-panel' | 'open-todo-panel' | 'open-checkpoint-panel' | 'open-plan-panel' | 'open-knowledge-panel' | 'open-help' | 'open-chat-switcher' | 'open-editor' | 'paste-image' | 'toggle-tangent' | 'toggle-plan' | 'clear-screen' | 'cancel-pending' | 'history-prev' | 'history-next' | 'auto-complete' | 'scroll-up' | 'scroll-down' | 'shell-command';
/** Raw input descriptor handed to {@link mapKey}. */
export interface RawKey {
    input: string;
    key: Key;
}
/** Map a raw key event to a high-level action, or `undefined` to let the
 * prompt input handle it (e.g. printable characters, navigation). */
export declare function mapKey(event: RawKey): KeyAction | undefined;
/** Default chord display for documentation purposes. */
export declare const CHEAT_SHEET: ReadonlyArray<readonly [string, KeyAction, string]>;
