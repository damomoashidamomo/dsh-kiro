/**
 * kiro-skills — the dsh-kiro provider for the platform's `ctx.skills`
 * registry: discovers SKILL.md bundles across kiro/dsh/agents roots
 * (project + user level), applies the workspace's selection file
 * (`.kiro/skills.json`, default ALL enabled), and exposes the selection
 * service the `/skills` command drives.
 *
 * Selective loading works at the PROVIDER level: disabled skills are never
 * listed as candidates, so neither the model-facing catalog (the `skill`
 * tool's advertisement, dsh-tool-skill) nor user commands ever see them.
 *
 * @module @damomoashidamomo/dsh-kiro/skills
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
/** Service id for the selection surface. */
export const KIRO_SKILL_SELECTION = 'kiroSkillSelection';
/** Stable Cordis plugin name. */
export const name = 'kiro-skills';
/** The skills registry must exist before we can register the provider. */
export const inject = ['skills'];
function selectionPath() {
    return join(process.cwd(), '.kiro', 'skills.json');
}
function loadDisabled() {
    try {
        const parsed = JSON.parse(readFileSync(selectionPath(), 'utf8'));
        return new Set(Array.isArray(parsed.disabled)
            ? parsed.disabled.filter((d) => typeof d === 'string' && d !== '')
            : []);
    }
    catch {
        return new Set();
    }
}
function saveDisabled(disabled) {
    try {
        mkdirSync(join(process.cwd(), '.kiro'), { recursive: true });
        writeFileSync(selectionPath(), `${JSON.stringify({ disabled: [...disabled].sort() }, null, 2)}\n`, 'utf8');
    }
    catch {
        // Unwritable workspace: the toggle still holds until restart.
    }
}
/** Parse minimal YAML frontmatter (key: value lines between --- fences). */
function parseFrontmatter(text) {
    const out = {};
    if (!text.startsWith('---'))
        return out;
    const end = text.indexOf('\n---', 3);
    if (end < 0)
        return out;
    for (const line of text.slice(3, end).split('\n')) {
        const match = /^([A-Za-z][\w-]*):\s*(.*)$/u.exec(line.trim());
        if (match !== null)
            out[match[1]] = match[2].trim().replace(/^['"]|['"]$/gu, '');
    }
    return out;
}
/** Scan every supported root; lower rank wins duplicate names. */
function discover(cwd) {
    const roots = [
        [join(cwd, '.kiro', 'skills'), 'project-kiro', 10],
        [join(cwd, '.dsh', 'skills'), 'project-dsh', 11],
        [join(cwd, '.agents', 'skills'), 'project-agents', 12],
        [join(homedir(), '.kiro', 'skills'), 'user-kiro', 20],
        [join(homedir(), '.dsh', 'skills'), 'user-dsh', 21],
        [join(homedir(), '.agents', 'skills'), 'user-agents', 22],
    ];
    const found = new Map();
    for (const [dir, source, rank] of roots) {
        if (!existsSync(dir))
            continue;
        for (const entry of readdirSync(dir).sort()) {
            const skillPath = join(dir, entry, 'SKILL.md');
            if (!existsSync(skillPath))
                continue;
            try {
                const raw = readFileSync(skillPath, 'utf8');
                const meta = parseFrontmatter(raw);
                const skillName = meta['name'] ?? entry;
                const existing = found.get(skillName);
                if (existing !== undefined && existing.rank <= rank)
                    continue;
                found.set(skillName, {
                    name: skillName,
                    description: meta['description'] ?? '',
                    whenToUse: meta['when-to-use'] ?? undefined,
                    path: skillPath,
                    source,
                    rank,
                    disableModelInvocation: meta['disable-model-invocation'] === 'true',
                });
            }
            catch {
                // Unreadable skill file — skip it.
            }
        }
    }
    return found;
}
/** Mount: register the provider + expose the selection service. */
export function apply(ctx) {
    let disabled = loadDisabled();
    let invalidate;
    // The ctx.skills type augmentation ships with @deepseek-ai/dsh-skill; this
    // bundle does not type-depend on it — structural cast, same pattern as the
    // approval/question waterfalls.
    const skills = ctx.skills;
    const dispose = skills?.registerProvider((control) => {
        invalidate = control.invalidate.bind(control);
        return {
            name: 'kiro',
            async list() {
                const all = discover(process.cwd());
                const candidates = [];
                for (const skill of all.values()) {
                    if (disabled.has(skill.name))
                        continue;
                    candidates.push({
                        name: skill.name,
                        description: skill.description !== '' ? skill.description : skill.name,
                        ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
                        invocation: {
                            modelInvocable: !skill.disableModelInvocation,
                            userInvocable: true,
                        },
                        source: skill.source,
                        provider: 'kiro',
                        resourceBase: { kind: 'directory', path: join(skill.path, '..') },
                        rank: skill.rank,
                        locator: { path: skill.path },
                        path: skill.path,
                    });
                }
                return candidates;
            },
            async get(candidate) {
                const raw = readFileSync(candidate.locator.path, 'utf8');
                const end = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1;
                const body = end >= 0 ? raw.slice(raw.indexOf('\n', end + 1) + 1) : raw;
                return {
                    name: candidate.name,
                    provider: candidate.provider,
                    content: body.trim(),
                    path: candidate.locator.path,
                };
            },
        };
    });
    ctx.provide(KIRO_SKILL_SELECTION, {
        list() {
            const rows = [];
            for (const skill of discover(process.cwd()).values()) {
                rows.push({
                    name: skill.name,
                    description: skill.description,
                    source: skill.source,
                    enabled: !disabled.has(skill.name),
                });
            }
            return [...rows];
        },
        setEnabled(name, enabled) {
            const all = discover(process.cwd());
            if (!all.has(name))
                return false;
            const next = new Set(disabled);
            if (enabled)
                next.delete(name);
            else
                next.add(name);
            disabled = next;
            saveDisabled(disabled);
            invalidate?.();
            return true;
        },
        refresh() {
            invalidate?.();
        },
    });
    // Provider registration lives for the process lifetime (single-mount TUI
    // plugin); the typed cleanup hook is not reachable through the structural
    // cast, and cordis scope disposal on unload reclaims the registration.
}
//# sourceMappingURL=index.js.map