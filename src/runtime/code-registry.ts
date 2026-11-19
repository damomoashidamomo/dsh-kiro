/**
 * 代码块登记处（方案 B+C）：转录里渲染过的每个代码块都记进来——
 * `/copy` 按编号取回（OSC 52 写剪贴板），长块自动落盘（方案 C），
 * 用户在目标终端可直接 `bash <路径>` 执行。
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/code-registry
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 一个被登记的代码块。 */
export interface CodeBlockEntry {
  /** 登记序号（从 1 递增，会话级）。 */
  readonly n: number
  /** 语言标签（bash/python/…，可能为空）。 */
  readonly lang: string
  /** 纯文本正文（无 ANSI）。 */
  readonly text: string
  /** 登记时间（epoch ms）。 */
  readonly at: number
  /** 方案 C 落盘路径（仅长块有）。 */
  readonly file?: string
}

/** 触发落盘的最小行数（含）——短命令直接 /copy，长脚本才落盘。 */
const SPILL_LINES = 5

/** OSC 52 剪贴板写入序列（base64 负载）。 */
export function osc52Sequence(text: string): string {
  const payload = Buffer.from(text, 'utf8').toString('base64')
  // 末尾打印字符防止部分终端吞换行
  return `\x1b]52;c;${payload}\x07`
}

/** 会话级登记处（App 渲染端调用 record；/copy 命令调用 recent）。 */
const entries: CodeBlockEntry[] = []

/** 记录一个代码块；长块（≥SPILL_LINES 行）自动落盘并返回带 file 的条目。 */
export function recordCodeBlock(lang: string, text: string, cwd: string = process.cwd()): CodeBlockEntry {
  const n = entries.length + 1
  const at = Date.now()
  const lines = text.split('\n')
  let file: string | undefined
  if (lines.length >= SPILL_LINES) {
    try {
      const dir = join(cwd, '.dsh-kiro', 'commands')
      mkdirSync(dir, { recursive: true })
      const ext = lang === 'bash' || lang === 'sh' || lang === 'shell' ? '.sh' : '.txt'
      file = join(dir, `cmd-${n}${ext}`)
      writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8')
    } catch {
      // 落盘失败不挡渲染/复制
    }
  }
  const entry: CodeBlockEntry = { n, lang, text, at, ...(file !== undefined ? { file } : undefined) }
  entries.push(entry)
  return entry
}

/** 最近 N 个条目（新→旧）。 */
export function recentCodeBlocks(count = 10): readonly CodeBlockEntry[] {
  return [...entries].reverse().slice(0, count)
}

/** 按编号取（1-based）。 */
export function codeBlockByN(n: number): CodeBlockEntry | undefined {
  return entries[n - 1]
}

/** 会话切换时清空（App 层调用）。 */
export function resetCodeBlocks(): void {
  entries.length = 0
}
