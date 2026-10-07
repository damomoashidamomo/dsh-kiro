/**
 * Edit-tool diff builder for approval cards — the B1 kiro-parity piece:
 * when the model wants to change a file, the approval panel shows the
 * actual diff (red deletions, green additions) instead of a JSON blob.
 *
 * Sources: the pending tool call's full argument JSON (the controller
 * records it on tool/call) plus the CURRENT file on disk (the TUI runs
 * locally, so reading the pre-edit content is safe) — a small LCS line
 * diff produces unified-style hunks.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/diff
 */
/** One rendered diff row. */
export interface DiffRow {
    readonly kind: 'hunk' | 'ctx' | 'add' | 'del' | 'note';
    readonly text: string;
}
/** Whether an approval for this tool name can show a diff. */
export declare function isEditableTool(toolName: string): boolean;
/** Build the diff rows for a pending edit-tool call. */
export declare function buildEditDiff(toolName: string, argsJson: string | undefined): DiffRow[] | undefined;
