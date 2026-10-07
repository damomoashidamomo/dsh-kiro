/**
 * kiro-style tool-permission panel. Shown in place of the prompt while the
 * platform's approval waterfall waits on this TUI's answerer:
 *
 *   ⚠ 工具需要批准
 *   工具: bash
 *   原因: escalate sandbox to danger-full-access: …
 *
 *   ❯ 1 允许一次
 *     2 本会话始终允许 (bash)
 *     3 拒绝（可填理由）
 *
 * Keys: 1/2/3 pick directly; ↑/↓ + Enter pick kiro-list style; Esc denies
 * without a reason. Choosing 拒绝 switches to a one-line reason input
 * (Enter submits — empty denies outright, Esc denies outright). Ctrl+C is
 * deliberately NOT consumed here: it falls through to the App's interrupt
 * handler and cancels the whole turn, which aborts the approval request.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/ApprovalOverlay
 */
import React from 'react';
import type { ApprovalChoice, ApprovalRequestUi } from '../runtime/types';
import type { DiffRow } from './diff';
export declare function ApprovalOverlay(props: {
    /** Edit-tool diff rows (B1): red/green view of what the call changes. */
    diff?: readonly DiffRow[] | undefined;
    request: ApprovalRequestUi;
    onResolve: (choice: ApprovalChoice) => void;
}): React.ReactElement;
