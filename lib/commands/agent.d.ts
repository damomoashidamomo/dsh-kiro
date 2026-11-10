/**
 * `/agent` — manage custom agents against `.dsh-kiro/agents/` directories
 * (project first, then the user-global one — the same files kiro-cli reads).
 *
 * create / edit / delete / rename / set-default / validate are implemented
 * here (kiro-cli parity): create writes the kiro-shaped template (name,
 * description, prompt, tools ["*"], allowedTools, model, …) and — unless
 * `--prompt` is given — opens $EDITOR on it, the way kiro-cli opens vim.
 * generate (model-authored definitions) and migrate stay phase-4 stubs.
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/** Bridge for the /agent option menu (shadow-proxy-free list access). */
export declare function agentListBridge(): readonly {
    name: string;
    description: string;
}[];
export declare const agentCommand: CommandDefinition;
