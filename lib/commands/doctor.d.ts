/**
 * `/doctor` — one-command health report (T-6). Collects everything that has
 * ever needed manual checking during debugging sessions:
 *
 * - package version + profile + DSH_HOME;
 * - the Cordis services this bundle depends on (each `ctx.get` — a missing
 *   one explains a "服务不可用" error immediately);
 * - whether the ink log-update/use-input patches are actually IN the
 *   installed tree (pnpm has served stale unpacked builds before);
 * - the ansi-tokenize override (0.3.1 — OSC 8 links die on 0.1.3);
 * - the current model's effort-ladder provenance;
 * - terminal capabilities (truecolor is load-bearing: past width bugs only
 *   reproduced with SGR present);
 * - workspace steering/hooks/paste state.
 *
 * Everything is best-effort: a failing probe reports ✗ and keeps going.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/doctor
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const doctorCommand: CommandDefinition;
