/**
 * `/todos` — the agent's todo list.
 *
 * Todos are whole-list snapshots written by the model through the
 * `todo_write` tool (dsh-tool-todo) and surfaced here as a session
 * projection: each write replaces the list, last write wins. This command
 * is the human side of that list.
 *
 * Subcommands:
 *   view                 show the current list (default)
 *   resume               bring the latest previous session's todo list into
 *                        this session (when this session has none yet);
 *                        covers live sessions in this process — e.g. after
 *                        `/chat new`
 *   clear-finished       drop completed items and write the trimmed list
 *   delete <index>       remove one item by its 1-based list index
 *   help                 usage
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const todoCommand: CommandDefinition;
