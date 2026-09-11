/**
 * kiro-trust — registers the TrustStore on the Cordis context so any plugin
 * (or the runtime) can read it via `ctx.get('kiroTrust')`. Phase 3 ships the
 * store + read API; phase 4 will hook into `agent/pre-step` to short-circuit
 * approval prompts for trusted tools.
 *
 * @module @damomoashidamomo/dsh-kiro/trust
 */
import { TrustStore } from './store.js';
/** Service identifier the runtime consults before invoking a tool. */
export const KIRO_TRUST = 'kiroTrust';
/** Stable Cordis plugin name. */
export const name = 'kiro-trust';
/** Mount the trust store. */
export function apply(ctx) {
    const store = new TrustStore();
    ctx.provide(KIRO_TRUST, store);
    ctx.logger.info?.('dsh-kiro: kiro-trust store mounted');
}
//# sourceMappingURL=index.js.map