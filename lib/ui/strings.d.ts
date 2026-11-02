/**
 * UI string catalog (T-4, minimal first pass): the most visible surface
 * strings in one place. Long-form command help stays where it is until a
 * real i18n need exists; this catalog covers the always-on chrome (prompt
 * placeholders, busy hint, status labels) so a future language switch has
 * a single module to replace.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/strings
 */
export declare const STRINGS: {
    readonly prompt: {
        readonly idlePlaceholder: "Type a message, / for commands, @ for tools, ! for shell…";
        readonly busyPlaceholder: "输入回车即可中途插话，纠正当前回合…";
        /** Prefix shown while the context percent is an estimate (resumed session). */
        readonly approxPrefix: "约 ";
    };
    readonly status: {
        readonly workspaceLabel: "工作区";
        readonly firstTokenLabel: "首字";
        readonly lastLabel: "last";
    };
    readonly transcript: {
        readonly emptyHint: "(empty — type a message and press Enter to start)";
        readonly steered: (preview: string) => string;
        readonly thinking: (chars: string, secs: number) => string;
        readonly thought: (chars: string) => string;
        readonly taskList: (done: number, total: number) => string;
    };
};
