/**
 * UI string catalog (T-4, minimal first pass): the most visible surface
 * strings in one place. Long-form command help stays where it is until a
 * real i18n need exists; this catalog covers the always-on chrome (prompt
 * placeholders, busy hint, status labels) so a future language switch has
 * a single module to replace.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/strings
 */
export const STRINGS = {
    prompt: {
        idlePlaceholder: 'Type a message, / for commands, @ for tools, ! for shell…',
        busyPlaceholder: '输入回车即可中途插话，纠正当前回合…',
        /** Prefix shown while the context percent is an estimate (resumed session). */
        approxPrefix: '约 ',
    },
    status: {
        workspaceLabel: '工作区',
        firstTokenLabel: '首字',
        lastLabel: 'last',
    },
    transcript: {
        emptyHint: '(empty — type a message and press Enter to start)',
        steered: (preview) => `↪ 已插话（下一步生效）：${preview}`,
        thinking: (chars, secs) => `思考中 · 已推理 ${chars} · ${secs}s…`,
        thought: (chars) => `已思考 · ${chars}`,
        taskList: (done, total) => `任务清单 (${done}/${total})`,
    },
};
//# sourceMappingURL=strings.js.map