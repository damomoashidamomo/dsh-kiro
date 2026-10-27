/**
 * `/help` — list all slash commands and a short summary, grouped by surface.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { groupCommands } from './registry'

export const helpCommand: CommandDefinition = {
  name: 'help',
  description: 'Show available slash commands and their descriptions',
  input: { hint: '[command-name]' },
  handler: async ({ rawInput }) => {
    const query = rawInput.trim().toLowerCase()
    const groups = groupCommands()
    if (query !== '') {
      for (const group of groups) {
        const match = group.items.find(item => item.name === query)
        if (match !== undefined) {
          const hint = match.input?.hint !== undefined ? ` ${match.input.hint}` : ''
          return {
            kind: 'success',
            text: [
              `/${match.name}${hint}`,
              `  ${match.description}`,
            ].join('\n'),
          }
        }
      }
      return { kind: "success", text: `No command named "${query}". Try /help for the full list.` }
    }
    const lines: string[] = []

    lines.push('━━━ 快捷键与输入前缀 ━━━')
    lines.push('  Enter            提交；回合运行中提交 = 中途插话（下一步生效，无需取消）')
    lines.push('  ↑ / ↓            补全弹窗打开时移动候选；否则翻阅输入历史')
    lines.push('  Tab / Enter       选中补全项（/ 命令或 @ 文件），插入后继续编辑')
    lines.push('  Esc              关闭弹窗 / 补全')
    lines.push('  Ctrl+C（两段）    第一次取消当前回合，回取消态再按一次退出 TUI')
    lines.push('  @路径            引用工作区文件：模糊补全，@"带空格 的路径" 语法；')
    lines.push('                   粘贴超过 8KB 自动落盘 .kiro/paste/ 并以 @ 引用')
    lines.push('  !命令            直通宿主 shell 执行，结果进转录')

    lines.push('')
    lines.push('━━━ 模式与环境能力 ━━━')
    lines.push('  计划模式 /plan    先探索后规划，经评审面板批准才实施（状态栏 [plan]）')
    lines.push('  权限预设 /permission  read-only / workspace-write / danger-full-access')
    lines.push('                   （状态栏 [read-only] / [write] / [full]）')
    lines.push('  工具审批面板      1 允许一次 · 2 本会话始终 · 3 本项目始终（写入')
    lines.push('                   .kiro/approvals.json，重启免问）· 4 拒绝（可填理由）')
    lines.push('                   edit / write / str_replace_editor 会显示红绿 diff')
    lines.push('  Todo 清单        模型调用 todo_write 时转录实时显示勾选进度')
    lines.push('  Steering         .kiro/steering/*.md（+ ~/.kiro/）注入系统提示；')
    lines.push('                   README 头 4KB 与 .kiro/skills/*/SKILL.md 自动常载；')
    lines.push('                   /steering reload 热重载')
    lines.push('  Hooks            .kiro/hooks.json（+ ~/.kiro/，Claude Code 兼容）')
    lines.push('                   七个拦截点；/hooks reload 热重载')
    lines.push('  状态栏           [agent] · 模型 · 状态 · 模式徽章 · 用量条（60%/80%')
    lines.push('                   变色并提醒 /compact）· 首字延迟 · last: 回合结果')
    lines.push('  变更护栏（内置）  生产环境变更 / 仓库外配置修改：先陈述计划与影响面，')
    lines.push('                   等你批准再执行；说"直接做"可豁免当轮')
    lines.push('  思考档位 /effort  auto（默认：关键词自动升档）/ low / high / max；')
    lines.push('                   「深入分析」「ultrathink」等短语按回合自动升档')

    lines.push('')
    lines.push('━━━ 全部命令 ━━━')
    for (const group of groups) {
      lines.push('')
      lines.push(` ${group.title}:`)
      for (const cmd of group.items) {
        const hint = cmd.input?.hint !== undefined ? ` ${cmd.input.hint}` : ''
        lines.push(`  /${cmd.name.padEnd(14)}${hint}  ${cmd.description}`)
      }
    }
    return { kind: "success", text: lines.join('\n') }
  },
}
