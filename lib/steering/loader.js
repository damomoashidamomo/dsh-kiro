/**
 * dsh-kiro steering files loader. Reads `.kiro/steering/*.md` and
 * `~/.kiro/steering/*.md`, parses simple frontmatter, and groups the result
 * by inclusion class so the runtime can mount the right slice.
 *
 * @module @damomoashidamomo/dsh-kiro/steering/loader
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/u;
function parseFrontmatter(raw) {
    const match = FRONTMATTER_RE.exec(raw);
    if (match === null)
        return { meta: {}, body: raw };
    const meta = {};
    const lines = (match[1] ?? '').split(/\r?\n/u);
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx <= 0)
            continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key !== '')
            meta[key] = value;
    }
    return { meta, body: match[2] ?? '' };
}
function classifyKind(meta) {
    const inclusion = meta['inclusion'] ?? 'always';
    if (inclusion === 'manual')
        return 'manual';
    if (inclusion === 'conditional' || meta['includeFiles'] !== undefined || meta['excludeFiles'] !== undefined) {
        return 'conditional';
    }
    return 'always';
}
function splitPatterns(value) {
    if (value === undefined)
        return [];
    return value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
}
function parseOne(path, source) {
    const raw = readFileSync(path, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    return {
        name: basename(path, '.md'),
        source,
        path,
        kind: classifyKind(meta),
        includeFiles: splitPatterns(meta['includeFiles']),
        excludeFiles: splitPatterns(meta['excludeFiles']),
        description: meta['description'] ?? '',
        content: body.trim(),
    };
}
/** Walk the well-known steering directories and parse every `.md` file. */
export function loadSteeringFiles() {
    const sources = [
        ['project', join(process.cwd(), '.kiro', 'steering')],
        ['user', join(homedir(), '.kiro', 'steering')],
    ];
    const out = [];
    for (const [source, dir] of sources) {
        if (!existsSync(dir))
            continue;
        const entries = readdirSync(dir);
        for (const entry of entries) {
            if (!entry.endsWith('.md'))
                continue;
            const path = join(dir, entry);
            if (!statSync(path).isFile())
                continue;
            try {
                out.push(parseOne(path, source));
            }
            catch {
                continue;
            }
        }
    }
    return out;
}
/** Resolve which steering files apply to a given cwd. */
export function resolveApplicableSteering(cwd, files) {
    return files.filter((file) => {
        if (file.kind === 'always')
            return true;
        if (file.kind === 'manual')
            return false;
        if (file.includeFiles.length === 0 && file.excludeFiles.length === 0)
            return true;
        const matches = (pattern) => {
            if (pattern === '')
                return false;
            if (pattern.includes('*')) {
                // Tiny glob: only `*` (any chars) — enough for the common case.
                const re = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`, 'u');
                return re.test(cwd);
            }
            return false;
        };
        if (file.excludeFiles.some((p) => matches(p)))
            return false;
        if (file.includeFiles.length === 0)
            return true;
        return file.includeFiles.some((p) => matches(p));
    });
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
//# sourceMappingURL=loader.js.map