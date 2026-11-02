/**
 * `/retry` — resubmit the last user prompt (typically after a failed turn:
 * timeout, rate limit, network). Reads the transcript via the controller,
 * resubmits through the runtime's submit path.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/retry
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const retryCommand: CommandDefinition;
