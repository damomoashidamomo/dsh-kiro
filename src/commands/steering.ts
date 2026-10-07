import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { getKiroSteering } from '../steering'

/**
 * /steering — surface the ACTUAL loaded steering state: which .kiro/steering
 * directories were read, which files apply to this cwd (frontmatter
 * inclusion: always / conditional globs / manual), and the composed
 * system-prompt section size.
 */
export const steeringCommand: CommandDefinition = {
  name: 'steering',
  description: 'Show loaded steering files (.kiro/steering/*.md)',
  handler: async () => {
    const state = getKiroSteering()
    if (state === undefined) {
      return {
        kind: 'error' as const,
        text: 'steering engine not loaded (dsh-kiro/steering plugin missing from the profile)',
      }
    }
    const lines: string[] = []
    if (state.applicable.length === 0) {
      lines.push('没有生效的 steering 文件。')
      lines.push(`已发现 ${state.files.length} 个文件（均不适用于当前目录或标记为 manual）。`)
    } else {
      lines.push(`生效的 steering（${state.applicable.length} 个，注入系统提示 ${state.sectionChars} 字符）：`)
      for (const file of state.applicable) {
        const src = file.source === 'user' ? '~/.kiro' : '.kiro'
        const desc = file.description !== '' ? ` — ${file.description}` : ''
        lines.push(`  ✓ ${file.name}（${src}，${file.kind}，${file.content.length} 字）${desc}`)
      }
    }
    const manual = state.files.filter((f) => f.kind === 'manual' || !state.applicable.includes(f))
    if (manual.length > 0) {
      lines.push('')
      lines.push('未生效（manual 或条件不匹配）：')
      for (const file of manual) {
        if (state.applicable.includes(file)) continue
        lines.push(`  · ${file.name}（${file.kind}）`)
      }
    }
    lines.push('')
    lines.push('放置 steering：在工作区 .kiro/steering/*.md 或 ~/.kiro/steering/*.md；')
    lines.push('frontmatter 支持 inclusion: always|conditional|manual 与 includeFiles/excludeFiles 逗号 glob。')
    return { kind: 'success' as const, text: lines.join('\n') }
  },
}
