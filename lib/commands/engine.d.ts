/**
 * `/engine` — whole-unit engine switch (P2): loop driver + tool engine in
 * ONE command, plus an honest capability readout.
 *
 *   /engine            status: both layers, rust availability, capabilities
 *   /engine kiro       kiro loop + Rust tool engine (falls back to platform
 *                      pipeline when the binary is not built)
 *   /engine kiro -p    kiro loop + platform tool pipeline (platform approvals
 *                      & sandbox inside ctx.tools)
 *   /engine dsh        back to the full platform stack
 *
 * @module @damomoashidamomo/dsh-kiro/commands/engine
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const engineCommand: CommandDefinition;
