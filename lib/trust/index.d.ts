/**
 * kiro-trust — registers the TrustStore on the Cordis context so any plugin
 * (or the runtime) can read it via `ctx.get('kiroTrust')`. Phase 3 ships the
 * store + read API; phase 4 will hook into `agent/pre-step` to short-circuit
 * approval prompts for trusted tools.
 *
 * @module @damomoashidamomo/dsh-kiro/trust
 */
import type { Context } from '@deepseek-ai/cordis';
/** Service identifier the runtime consults before invoking a tool. */
export declare const KIRO_TRUST = "kiroTrust";
/** Stable Cordis plugin name. */
export declare const name = "kiro-trust";
/** Mount the trust store. */
export declare function apply(ctx: Context): void;
