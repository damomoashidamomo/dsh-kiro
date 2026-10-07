import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
/**
 * /hooks — surface the ACTUAL loaded state of the kiro hooks engine: where
 * each config file was sought (`.kiro/hooks.json` workspace + `~/.kiro/`
 * user), every configured command hook in run order, and the most recent
 * invocations with their folded decision.
 */
export declare const hooksCommand: CommandDefinition;
