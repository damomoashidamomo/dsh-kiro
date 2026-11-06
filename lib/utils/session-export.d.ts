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
/** Marker written into every export; a load refuses anything else. */
export declare const EXPORT_FORMAT = "dsh-kiro/session-export@1";
/** One durable event in a session log. */
export type SessionEvent = {
    type: string;
    [key: string]: unknown;
};
/** The JSON document `/chat save` writes and `/chat load` reads. */
export interface SessionExport {
    readonly format: typeof EXPORT_FORMAT;
    /** Epoch ms when the export was taken. */
    readonly savedAt: number;
    /** Session identity and the workspace it belonged to. */
    readonly session: {
        readonly id: string;
        readonly createdAt: number;
        readonly cwd: string;
        /** One-line description shown in listings, when the log had one. */
        readonly title: string;
    };
    /** Decoded log: header record first, then every dated event. */
    readonly events: readonly SessionEvent[];
    /** dsh-kiro version that produced the file (diagnostics only). */
    readonly exporter: string;
}
/** Expand a leading `~` and resolve relative paths against `base`. */
export declare function resolveUserPath(input: string, base?: string): string;
/**
 * Decode every event of a session log.
 *
 * The log is an append log of CONCATENATED zstd frames and
 * `zstdDecompressSync` stops after the first one, so the frames have to be
 * split on the magic first. A torn tail frame is normal after a crash and is
 * skipped.
 */
export declare function readLogEvents(dir: string): SessionEvent[];
/** Serialise a decided session into an export document. */
export declare function buildExport(options: {
    id: string;
    createdAt: number;
    cwd: string;
    title: string;
    events: readonly SessionEvent[];
    exporter: string;
}): SessionExport;
/** Write the export, refusing to clobber an existing file unless forced. */
export declare function writeExportFile(path: string, payload: SessionExport, force: boolean): void;
/** Read and validate an export file. */
export declare function readExportFile(path: string): SessionExport;
/** Pick the id a restored session gets. */
export declare function restoreId(exportedId: string, taken: ReadonlySet<string>, mint: () => string): {
    id: string;
    reused: boolean;
};
/**
 * Materialise a session log for a restored export.
 *
 * One zstd frame per event, exactly like the platform's writer, and the header
 * rewritten to the id/cwd the restore decided on. Returns the session
 * directory, which the caller can then resume.
 */
export declare function writeRestoredLog(options: {
    dir: string;
    id: string;
    cwd: string;
    createdAt: number;
    events: readonly SessionEvent[];
}): string;
/** Arguments of `/chat save` (kiro-cli shape: <PATH> [-f|--force]). */
export declare function parseSaveArgs(args: readonly string[]): {
    path?: string;
    force: boolean;
    help: boolean;
};
