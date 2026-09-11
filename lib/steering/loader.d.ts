/**
 * dsh-kiro steering files loader. Reads `.kiro/steering/*.md` and
 * `~/.kiro/steering/*.md`, parses simple frontmatter, and groups the result
 * by inclusion class so the runtime can mount the right slice.
 *
 * @module @damomoashidamomo/dsh-kiro/steering/loader
 */
/** Where a steering file came from. */
export type SteeringSource = 'project' | 'user';
/** Inclusion class for a steering file. */
export type SteeringKind = 'always' | 'conditional' | 'manual';
/** Parsed steering record. */
export interface SteeringFile {
    readonly name: string;
    readonly source: SteeringSource;
    readonly path: string;
    readonly kind: SteeringKind;
    readonly includeFiles: readonly string[];
    readonly excludeFiles: readonly string[];
    readonly description: string;
    readonly content: string;
}
/** Walk the well-known steering directories and parse every `.md` file. */
export declare function loadSteeringFiles(): SteeringFile[];
/** Resolve which steering files apply to a given cwd. */
export declare function resolveApplicableSteering(cwd: string, files: readonly SteeringFile[]): SteeringFile[];
