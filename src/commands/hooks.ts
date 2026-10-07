import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { getKiroHooks } from '../hooks'

/**
 * /hooks — surface the ACTUAL loaded state of the kiro hooks engine: where
 * each config file was sought (`.kiro/hooks.json` workspace + `~/.kiro/`
 * user), every configured command hook in run order, and the most recent
 * invocations with their folded decision.
 */
export const hooksCommand: CommandDefinition = {
  name: 'hooks',
  description: 'Show configured hooks (.kiro/hooks.json) and recent runs',
  input: { hint: '[reload]' },
  handler: async ({ rawInput }) => {
    if ((rawInput ?? '').trim() === 'reload') {
      const service = getKiroHooks()
      if (service === undefined) {
        return { kind: 'error' as const, text: 'hooks engine not loaded' }
      }
      const { hooks } = service.reload()
      const lines = ['已重新读取配置：']
      for (const source of service.sources) {
        lines.push(`  ${source.loaded ? '✓' : '·'} ${source.path}${source.reason !== undefined ? `（${source.reason}）` : ''}`)
      }
      lines.push(`当前生效 ${hooks} 个 hook，无需重启。`)
      return { kind: 'success' as const, text: lines.join('\n') }
    }
    const service = getKiroHooks()
    if (service === undefined) {
      return {
        kind: 'error' as const,
        text: 'hooks engine not loaded (dsh-kiro/hooks plugin missing from the profile)',
      }
    }

    const lines: string[] = []

    // Where configs were sought and whether they loaded.
    lines.push('配置来源：')
    for (const source of service.sources) {
      lines.push(`  ${source.loaded ? '✓' : '·'} ${source.path}${source.reason !== undefined ? `（${source.reason}）` : ''}`)
    }

    // Configured hooks in run order (user level first, then workspace).
    if (service.entries.length === 0) {
      lines.push('')
      lines.push('未配置任何 hook。在工作区 .kiro/hooks.json 或 ~/.kiro/hooks.json 写入')
      lines.push('Claude Code 兼容格式后重启 dsh 生效，例：')
      lines.push('  {"hooks":{"PreToolUse":[{"matcher":"bash","hooks":[{"type":"command","command":"./guard.sh"}]}]}}')
    } else {
      lines.push('')
      lines.push(`已装载 ${service.entries.length} 个 hook（按运行顺序，user 级先于 workspace 级）：`)
      for (const entry of service.entries) {
        const matcher = entry.matcher !== undefined ? ` matcher=${entry.matcher}` : ''
        lines.push(`  ${entry.point}${matcher}  [${entry.source}]  ${entry.command}`)
      }
    }

    // Recent invocations (bounded ring), newest first.
    const recent = service.recent(10)
    if (recent.length > 0) {
      lines.push('')
      lines.push('最近调用（最新在前，最多 10 条）：')
      for (const run of recent) {
        const matcher = run.matcher !== undefined ? ` (${run.matcher})` : ''
        const exit = run.exitCode !== undefined ? ` exit=${run.exitCode}` : ''
        lines.push(`  ${run.point}${matcher} → ${run.decision}${exit}  ${run.durationMs}ms`)
      }
    }

    return { kind: 'success' as const, text: lines.join('\n') }
  },
}
