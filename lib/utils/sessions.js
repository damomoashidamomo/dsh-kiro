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
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { zstdDecompress, zstdDecompressSync } from 'node:zlib';
import { promisify } from 'node:util';
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
/** Promise-based single-frame zstd decode (yields to the event loop). */
const decompress = promisify(zstdDecompress);
/** zstd frame magic — the store appends one frame per durable write. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
/**
 * Append logs hold MANY concatenated zstd frames; `zstdDecompressSync` stops at
 * the first one, so a single call returns just the header. Split on the magic
 * and decompress frame by frame.
 *
 * `maxBytes` bounds the work: a session that ran for hours can hold megabytes,
 * and the title scan only needs the top of the log.
 */
function decompressFrames(file, maxBytes) {
    let raw;
    try {
        raw = readFileSync(file);
    }
    catch {
        return [];
    }
    const starts = [];
    for (let i = 0; i + 4 <= raw.length; i += 1) {
        if (raw.compare(ZSTD_MAGIC, 0, 4, i, i + 4) === 0)
            starts.push(i);
    }
    if (starts.length === 0)
        return [];
    const out = [];
    let used = 0;
    for (let i = 0; i < starts.length; i += 1) {
        const begin = starts[i];
        const end = i + 1 < starts.length ? starts[i + 1] : raw.length;
        try {
            const plain = zstdDecompressSync(raw.subarray(begin, end)).toString('utf8');
            out.push(plain);
            used += plain.length;
        }
        catch {
            // A torn tail frame is normal (crash mid-write) — keep what parsed.
            continue;
        }
        if (used >= maxBytes)
            break;
    }
    return out;
}
/** `ZSTD` frame offsets in a byte buffer (append logs are frame-concatenated). */
function frameOffsets(raw) {
    const starts = [];
    for (let i = 0; i + 4 <= raw.length; i += 1) {
        if (raw.compare(ZSTD_MAGIC, 0, 4, i, i + 4) === 0)
            starts.push(i);
    }
    return starts;
}
/** Pull the title candidates out of one decompressed frame's JSONL text. */
function foldTitleFrame(frame, current) {
    let { title, firstUser } = current;
    for (const line of frame.split('\n')) {
        if (line.trim() === '')
            continue;
        if (title !== '' && firstUser !== '')
            break;
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            continue;
        }
        if (event.type === 'session/title') {
            const value = event.data?.title;
            if (typeof value === 'string' && value.trim() !== '')
                title = tidy(value);
            continue;
        }
        if (firstUser !== '' || event.type !== 'user/message')
            continue;
        const data = event.data;
        if (data?.source?.kind !== 'user' || !Array.isArray(data.content))
            continue;
        for (const part of data.content) {
            const text = part;
            if (text?.type === 'text' && typeof text.text === 'string' && text.text.trim() !== '') {
                firstUser = tidy(text.text);
                break;
            }
        }
    }
    return { title, firstUser };
}
/**
 * Async twin of {@link readSessionTitle}. Titles are read while the /chat menu
 * is already on screen, so the scan must not block the Ink event loop: every
 * frame decompression is awaited (yielding between frames) and the file itself
 * is read through `fs/promises`.
 */
export async function readSessionTitleAsync(dir, maxBytes = 2_000_000) {
    let raw;
    try {
        raw = await readFile(join(dir, 'session.v3.jsonl.zstd'));
    }
    catch {
        return { title: '', firstUser: '' };
    }
    const starts = frameOffsets(raw);
    let acc = { title: '', firstUser: '' };
    let used = 0;
    for (let i = 0; i < starts.length; i += 1) {
        const begin = starts[i];
        const end = i + 1 < starts.length ? starts[i + 1] : raw.length;
        let plain;
        try {
            plain = (await decompress(raw.subarray(begin, end))).toString('utf8');
        }
        catch {
            continue;
        }
        used += plain.length;
        acc = foldTitleFrame(plain, acc);
        if ((acc.title !== '' && acc.firstUser !== '') || used >= maxBytes)
            break;
    }
    return acc;
}
/** Trim a title candidate to one readable line. */
function tidy(text, limit = 48) {
    const flat = text.replace(/\s+/gu, ' ').trim();
    return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}
/**
 * Read a session's title straight from its log file.
 *
 * This deliberately does NOT go through the platform's session query: its
 * persistence listing refuses to load ANY log once the store contains a
 * duplicate session id ("appears in multiple project directories") or a log
 * whose tail fails validation, which silently removed every title from the
 * /chat menu and from `/chat list`. Reading the file we already located keeps
 * the listing working whatever shape the store is in.
 *
 * Preference: the durable `session/title` event, else the first user message.
 */
export function readSessionTitle(dir, maxBytes = 2_000_000) {
    const file = join(dir, 'session.v3.jsonl.zstd');
    let title = '';
    let firstUser = '';
    for (const frame of decompressFrames(file, maxBytes)) {
        for (const line of frame.split('\n')) {
            if (line.trim() === '')
                continue;
            let event;
            try {
                event = JSON.parse(line);
            }
            catch {
                continue;
            }
            const type = event.type;
            if (type === 'session/title') {
                const value = event.data?.title;
                if (typeof value === 'string' && value.trim() !== '')
                    title = tidy(value);
            }
            else if (firstUser === '' && type === 'user/message') {
                const data = event.data;
                if (data?.source?.kind !== 'user' || !Array.isArray(data.content))
                    continue;
                for (const part of data.content) {
                    const text = part;
                    if (text?.type === 'text' && typeof text.text === 'string' && text.text.trim() !== '') {
                        firstUser = tidy(text.text);
                        break;
                    }
                }
            }
            if (title !== '' && firstUser !== '')
                return { title, firstUser };
        }
    }
    return { title, firstUser };
}
/** List every session under `$DSH_HOME/sessions`, newest first. */
/** Short-lived cache: a picker open lists sessions more than once. */
const LISTING_TTL_MS = 5000;
const listingCache = new Map();
/** Drop the cached listing (after a delete, or in tests). */
export function invalidateSessionCache() {
    listingCache.clear();
}
export function listSessions(home = defaultHome()) {
    const cached = listingCache.get(home);
    if (cached !== undefined && Date.now() - cached.at < LISTING_TTL_MS)
        return cached.rows;
    const rows = scanSessions(home);
    listingCache.set(home, { at: Date.now(), rows });
    return rows;
}
function scanSessions(home) {
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
    invalidateSessionCache();
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