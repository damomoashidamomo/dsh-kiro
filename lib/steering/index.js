/**
 * kiro-steering — discovers `.kiro/steering/*.md` and `~/.kiro/steering/*.md`,
 * parses each file's frontmatter, and publishes the resolved list on the
 * Cordis context so the runtime can inject them into the system prompt.
 *
 * @module @damomoashidamomo/dsh-kiro/steering
 */
import { loadSteeringFiles, resolveApplicableSteering, } from "./loader.js";
/** Service identifier for the parsed steering-file list. */
export const KIRO_STEERING = 'kiroSteering';
/** Stable Cordis plugin name. */
export const name = 'kiro-steering';
/** Mount the loader. */
export function apply(ctx) {
    const files = loadSteeringFiles();
    const applicable = resolveApplicableSteering(process.cwd(), files);
    ctx.provide(KIRO_STEERING, { files, applicable });
    ctx.logger.info?.(`dsh-kiro: kiro-steering mounted (${applicable.length}/${files.length} applicable to ${process.cwd()})`);
}
//# sourceMappingURL=index.js.map