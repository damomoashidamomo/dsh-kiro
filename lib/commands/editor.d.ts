/**
 * `/editor` — open `$EDITOR` (or `$VISUAL`, falling back to `vi`) to compose
 * a longer prompt. The composed text is dropped back into the prompt buffer.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const editorCommand: CommandDefinition;
