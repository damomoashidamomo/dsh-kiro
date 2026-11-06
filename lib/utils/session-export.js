/**
 * Session export / import — the `/chat save` + `/chat load` pair.
 *
 * kiro-cli exports the whole conversation state to a JSON file and can load it
 * back later (`✔ Exported chat session state to <path>`). dsh-kiro keeps its
 * sessions as append-only logs under
 * `$DSH_HOME/sessions/<source>/<id>/session.v3.jsonl.zstd`, so the export is the
 * decoded event list plus the metadata needed to place it back in the store.
 *
 * The file is deliberately self-contained: a session restored from a backup
 * survives the original being deleted, or moving to another machine.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/session-export
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
/** Marker written into every export; a load refuses anything else. */
export const EXPORT_FORMAT = 'dsh-kiro/session-export@1';
/** zstd frame magic — the store appends one frame per durable write. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
/** Expand a leading `~` and resolve relative paths against `base`. */
export function resolveUserPath(input, base = process.cwd()) {
    const trimmed = input.trim();
    if (trimmed === '~')
        return homedir();
    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\'))
        return join(homedir(), trimmed.slice(2));
    return isAbsolute(trimmed) ? trimmed : resolve(base, trimmed);
}
/**
 * Decode every event of a session log.
 *
 * The log is an append log of CONCATENATED zstd frames and
 * `zstdDecompressSync` stops after the first one, so the frames have to be
 * split on the magic first. A torn tail frame is normal after a crash and is
 * skipped.
 */
export function readLogEvents(dir) {
    let raw;
    try {
        raw = readFileSync(join(dir, 'session.v3.jsonl.zstd'));
    }
    catch {
        return [];
    }
    const starts = [];
    for (let i = 0; i + 4 <= raw.length; i += 1) {
        if (raw.compare(ZSTD_MAGIC, 0, 4, i, i + 4) === 0)
            starts.push(i);
    }
    const events = [];
    for (let i = 0; i < starts.length; i += 1) {
        const begin = starts[i];
        const end = i + 1 < starts.length ? starts[i + 1] : raw.length;
        let plain;
        try {
            plain = zstdDecompressSync(raw.subarray(begin, end)).toString('utf8');
        }
        catch {
            continue;
        }
        for (const line of plain.split('\n')) {
            if (line.trim() === '')
                continue;
            try {
                const event = JSON.parse(line);
                if (typeof event?.type === 'string')
                    events.push(event);
            }
            catch {
                // A partially written line at the tail — skip it.
            }
        }
    }
    return events;
}
/** Serialise a decided session into an export document. */
export function buildExport(options) {
    return {
        format: EXPORT_FORMAT,
        savedAt: Date.now(),
        session: {
            id: options.id,
            createdAt: options.createdAt,
            cwd: options.cwd,
            title: options.title,
        },
        events: options.events,
        exporter: options.exporter,
    };
}
/** Write the export, refusing to clobber an existing file unless forced. */
export function writeExportFile(path, payload, force) {
    if (!force && existsSync(path)) {
        throw new Error(`文件已存在：${path}（加 --force 覆盖）`);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
/** Read and validate an export file. */
export function readExportFile(path) {
    let raw;
    try {
        raw = readFileSync(path, 'utf8');
    }
    catch {
        throw new Error(`读不到文件：${path}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`不是合法的 JSON：${path}`);
    }
    const doc = parsed;
    if (doc === null || typeof doc !== 'object' || doc.format !== EXPORT_FORMAT) {
        throw new Error(`不是 dsh-kiro 导出的会话文件（缺少 ${EXPORT_FORMAT} 标记）：${path}`);
    }
    if (!Array.isArray(doc.events) || doc.events.length === 0) {
        throw new Error(`导出文件里没有事件：${path}`);
    }
    const header = doc.events[0];
    if (header?.type !== 'session' || typeof header.id !== 'string') {
        throw new Error(`导出文件缺少会话头（第一条事件必须是 session）：${path}`);
    }
    return doc;
}
/** Pick the id a restored session gets. */
export function restoreId(exportedId, taken, mint) {
    if (!taken.has(exportedId))
        return { id: exportedId, reused: true };
    return { id: mint(), reused: false };
}
/**
 * Materialise a session log for a restored export.
 *
 * One zstd frame per event, exactly like the platform's writer, and the header
 * rewritten to the id/cwd the restore decided on. Returns the session
 * directory, which the caller can then resume.
 */
export function writeRestoredLog(options) {
    const header = {
        ...options.events[0],
        type: 'session',
        id: options.id,
        createdAt: options.createdAt,
        cwd: options.cwd,
    };
    const rest = options.events.slice(1);
    const frames = [header, ...rest].map((event) => zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`)));
    mkdirSync(options.dir, { recursive: true });
    writeFileSync(join(options.dir, 'session.v3.jsonl.zstd'), Buffer.concat(frames));
    return options.dir;
}
/** Arguments of `/chat save` (kiro-cli shape: <PATH> [-f|--force]). */
export function parseSaveArgs(args) {
    const force = args.some((arg) => arg === '-f' || arg === '--force');
    const help = args.some((arg) => arg === '-h' || arg === '--help');
    const path = args.find((arg) => !arg.startsWith('-'));
    return { path, force, help };
}
//# sourceMappingURL=session-export.js.map