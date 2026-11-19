/**
 * `/copy` — 方案 B：把最近的代码块写进剪贴板（OSC 52）。
 *
 *   /copy           列出最近 10 个代码块（编号/语言/预览/时间）
 *   /copy 2         第 2 块写入剪贴板（同时回显全文，终端不支持 OSC 52 时
 *                   仍可手动选择回显区）
 *
 * @module @damomoashidamomo/dsh-kiro/commands/copy
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const copyCommand: CommandDefinition;
