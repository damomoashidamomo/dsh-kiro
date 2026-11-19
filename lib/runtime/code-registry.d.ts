/**
 * 代码块登记处（方案 B+C）：转录里渲染过的每个代码块都记进来——
 * `/copy` 按编号取回（OSC 52 写剪贴板），长块自动落盘（方案 C），
 * 用户在目标终端可直接 `bash <路径>` 执行。
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/code-registry
 */
/** 一个被登记的代码块。 */
export interface CodeBlockEntry {
    /** 登记序号（从 1 递增，会话级）。 */
    readonly n: number;
    /** 语言标签（bash/python/…，可能为空）。 */
    readonly lang: string;
    /** 纯文本正文（无 ANSI）。 */
    readonly text: string;
    /** 登记时间（epoch ms）。 */
    readonly at: number;
    /** 方案 C 落盘路径（仅长块有）。 */
    readonly file?: string;
}
/** OSC 52 剪贴板写入序列（base64 负载）。 */
export declare function osc52Sequence(text: string): string;
/** 记录一个代码块；长块（≥SPILL_LINES 行）自动落盘并返回带 file 的条目。 */
export declare function recordCodeBlock(lang: string, text: string, cwd?: string): CodeBlockEntry;
/** 最近 N 个条目（新→旧）。 */
export declare function recentCodeBlocks(count?: number): readonly CodeBlockEntry[];
/** 按编号取（1-based）。 */
export declare function codeBlockByN(n: number): CodeBlockEntry | undefined;
/** 会话切换时清空（App 层调用）。 */
export declare function resetCodeBlocks(): void;
