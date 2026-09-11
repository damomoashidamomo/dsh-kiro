/**
 * `/clear` — clear the visible transcript. The session log is preserved in
 * the JSONL store, so a /chat resume replays it.
 *
 * Implementation note: clearing the visible transcript means pushing a
 * special "clear" marker to the SessionController, which then drops every
 * message currently in the rendered state. The session log is untouched.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const clearCommand: CommandDefinition;
