/**
 * Session catalog — read on-disk session headers from the JSONL persistence
 * store under `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`. The
 * store keeps the durable log compressed with zstd (Node's built-in `zlib`),
 * so this module streams a single decompression per file and parses only the
 * first JSONL line — the `session` header — to build the listing.
 *
 * The header has the shape produced by `dsh-session-persistence-jsonl`:
 *   { type: "session", version: 3, id, createdAt, cwd, isSeeded, delegationDepth }
 *
 * @module @damomoashidamomo/dsh-kiro/utils/sessions
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { brandString } from '@deepseek-ai/dsh-brand';
/** Default `$DSH_HOME` when the env var is unset — `~/.dsh`. */
function defaultHome() {
    const env = process.env.DSH_HOME;
    if (typeof env === 'string' && env.trim() !== '')
        return env;
    return join(homedir(), '.dsh');
}
/** Read and decompress a single session header from disk. */
function readHeader(path) {
    let compressed;
    try {
        compressed = readFileSync(path);
    }
    catch {
        return undefined;
    }
    let plaintext;
    try {
        plaintext = zstdDecompressSync(compressed).toString('utf8');
    }
    catch {
        return undefined;
    }
    const firstNewline = plaintext.indexOf('\n');
    const head = firstNewline === -1 ? plaintext : plaintext.slice(0, firstNewline);
    let record;
    try {
        record = JSON.parse(head);
    }
    catch {
        return undefined;
    }
    if (record === null
        || typeof record !== 'object'
        || record.type !== 'session'
        || typeof record.id !== 'string'
        || typeof record.cwd !== 'string'
        || typeof record.createdAt !== 'number') {
        return undefined;
    }
    return {
        id: record.id,
        cwd: record.cwd,
        createdAt: record.createdAt,
    };
}
/** List every session under `$DSH_HOME/sessions`, newest first. */
export function listSessions(home = defaultHome()) {
    const root = join(home, 'sessions');
    if (!existsSync(root))
        return [];
    const out = [];
    for (const source of readdirSync(root)) {
        const sourceDir = join(root, source);
        if (!statSync(sourceDir).isDirectory())
            continue;
        for (const id of readdirSync(sourceDir)) {
            if (!id.startsWith('session-'))
                continue;
            const file = join(sourceDir, id, 'session.v3.jsonl.zstd');
            if (!existsSync(file))
                continue;
            const header = readHeader(file);
            if (header === undefined)
                continue;
            out.push({
                id: header.id,
                sessionId: brandString(header.id),
                cwd: header.cwd,
                createdAt: header.createdAt,
                dir: join(sourceDir, id),
                source,
            });
        }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
}
/**
 * Narrow a session listing by the current working directory or an explicit
 * prefix. The default filter keeps any session whose `cwd` equals the target
 * OR is a descendant of it (a session opened in `/proj/sub` shows up in
 * listings from `/proj`, but not the other way around).
 */
export function filterSessions(summaries, filter = {}) {
    const want = filter.cwd ?? process.cwd();
    const wantAbs = isAbsolute(want) ? want : join(process.cwd(), want);
    return summaries.filter((s) => {
        if (s.cwd === wantAbs)
            return true;
        const rel = relative(wantAbs, s.cwd);
        return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
    });
}
/**
 * Remove a session by id. The id is the `session-<uuid>` directory name; we
 * search every source bucket under `sessions/` for a matching directory.
 * Returns `true` when a directory was removed, `false` otherwise.
 */
export function deleteSession(id, home = defaultHome()) {
    const root = join(home, 'sessions');
    if (!existsSync(root))
        return false;
    for (const source of readdirSync(root)) {
        const sourceDir = join(root, source);
        if (!statSync(sourceDir).isDirectory())
            continue;
        const target = join(sourceDir, id);
        if (existsSync(target)) {
            rmSync(target, { recursive: true, force: true });
            return true;
        }
    }
    return false;
}
/** Format a `createdAt` epoch as `YYYY-MM-DD HH:MM` in local time. */
export function formatTimestamp(epochMs) {
    const d = new Date(epochMs);
    const pad = (n) => n.toString().padStart(2, '0');
    return (`${d.getFullYear().toString()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        + ` ${pad(d.getHours())}:${pad(d.getMinutes())}`);
}
//# sourceMappingURL=sessions.js.map