/**
 * Quote-aware argument tokenizing for slash-command handlers.
 *
 * `parseCommand` hands handlers the raw tail untokenized, and every handler
 * splits it on whitespace — so `--prompt "你好 世界"` arrived as `'"你好'`
 * plus `世界"'`: quotes stored verbatim and the value truncated at the first
 * space. This tokenizer keeps quoted runs together and strips the quotes.
 *
 * @module @damomoashidamomo/dsh-kiro/utils/args
 */

/**
 * Split on whitespace, treating `"…"` and `'…'` runs as ONE token with the
 * quotes stripped. Unterminated quotes degrade to the literal text.
 */
export function tokenizeArgs(input: string): string[] {
  const tokens: string[] = []
  for (const match of input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return tokens
}

/** Join the tokens of a path-like argument back together (spaces survive). */
export function joinPathTokens(tokens: readonly string[]): string {
  return tokens.join(' ').trim()
}
