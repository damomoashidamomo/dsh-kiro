/**
 * PickerOverlay — kiro-style interactive list chooser. A slash command opens
 * it with a title + items (see SessionController.openPicker); the user moves
 * with ↑/↓, confirms with Enter, cancels with Esc (or Ctrl+C), and typing
 * filters the list (kiro panels are all fuzzy-searchable). While open it
 * replaces the Prompt row, so its `useInput` is the only input handler
 * besides App's global shortcuts.
 *
 * Filtering is local to this component; selection state stays authoritative
 * in the SessionController (absolute indexes into the full items array).
 *
 * @module @damomoashidamomo/dsh-kiro/ui/PickerOverlay
 */
import type { PickerState } from '../runtime/types';
export interface PickerOverlayProps {
    /** Live picker state (title, items, highlighted index). */
    readonly picker: PickerState;
    /** Jump the highlight to an absolute index into `picker.items`. */
    readonly onMoveTo: (index: number) => void;
    /** Confirm the highlighted row. */
    readonly onSelect: () => void;
    /** Cancel the picker (Esc / Ctrl+C). */
    readonly onClose: () => void;
}
/** Render the interactive picker. */
export declare function PickerOverlay({ picker, onMoveTo, onSelect, onClose }: PickerOverlayProps): JSX.Element;
