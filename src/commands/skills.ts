/**
 * `/skills` — selective skill loading (kiro-cli parity, like /model for
 * models): list every discovered SKILL.md across kiro/dsh/agents roots with
 * its on/off state, toggle per name, persisted in `.kiro/skills.json`.
 * Disabled skills never enter the model-facing catalog (the `skill` tool)
 * because the kiro provider filters at listing time.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/skills
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

interface SelectionService {
  list(): readonly { name: string; description: string; source: string; enabled: boolean }[]
  setEnabled(name: string, enabled: boolean): boolean
  refresh(): void
}

export const skillsCommand: CommandDefinition = {
  name: 'skills',
  description: 'Skills: selective loading (like /model)',
  input: { hint: '[<name> on|off]' },
  handler: async ({ agent, rawInput }) => {
    const ctx = (agent as { ctx?: unknown }).ctx
    const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
    const service = typeof get === 'function'
      ? get.call(ctx, 'kiroSkillSelection') as SelectionService | undefined
      : undefined
    if (service === undefined) {
      return { kind: 'error', text: '/skills: 技能选择服务不可用（kiro-skills 插件未挂载？）' }
    }

    const tokens = rawInput.trim().split(/\s+/u).filter(Boolean)
    if (tokens.length === 0) {
      const rows = service.list()
      if (rows.length === 0) {
        return {
          kind: 'success',
          text: [
            '未发现任何技能。放入任一目录即可被识别：',
            '  .kiro/skills/<name>/SKILL.md（项目/用户级）或 .dsh/skills · .agents/skills',
            'SKILL.md 头部 frontmatter 支持 name / description / when-to-use / disable-model-invocation。',
          ].join('\n'),
        }
      }
      const lines = [`发现 ${rows.length} 个技能（模型经 skill 工具按需加载；关闭后完全不可见）：`]
      for (const row of rows) {
        const mark = row.enabled ? '◉' : '○'
        const desc = row.description !== '' ? `  ${row.description.slice(0, 60)}` : ''
        lines.push(`  ${mark} ${row.name} [${row.source}]${desc}`)
      }
      lines.push('')
      lines.push('用 /skills <name> on|off 切换；选择持久化在 .kiro/skills.json。')
      return { kind: 'success', text: lines.join('\n') }
    }

    if (tokens.length === 2 && (tokens[1] === 'on' || tokens[1] === 'off')) {
      const ok = service.setEnabled(tokens[0]!, tokens[1] === 'on')
      if (!ok) return { kind: 'error', text: `未找到技能：${tokens[0]}（用无参数 /skills 查看清单）` }
      return { kind: 'success', text: `技能 ${tokens[0]} 已${tokens[1] === 'on' ? '启用' : '停用'}（对模型目录立即生效）。` }
    }

    return { kind: 'error', text: 'usage: /skills [<name> on|off]' }
  },
}
