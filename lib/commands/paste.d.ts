import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * /paste — manage the oversized-paste spill files that Prompt writes into
 * `<workspace>/.kiro/paste/paste-<stamp>.txt` (see `spillPaste`).
 *
 *   /paste          list the spilled files (same as `/paste list`)
 *   /paste list     list them: name, size, modification time, newest first
 *   /paste clean    delete every paste-*.txt file (other files in the
 *                   directory are left alone); removes the directory when it
 *                   ends up empty
 *
 * The draft's `@.kiro/paste/…` mentions are only path references — cleaning
 * the files means a draft that still references one must be re-pasted.
 */
export declare const pasteCommand: CommandDefinition;
