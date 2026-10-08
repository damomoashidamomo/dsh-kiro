import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const changelogCommand: CommandDefinition = {
  name: 'changelog',
  description: 'Show the latest dsh-kiro changes',
  handler: async () => {
    return {
      kind: 'success',
      text: [
        'dsh-kiro changelog:',
        '  0.4.x  习惯驱动改善（基于 96 个 kiro 会话分析）：',
        '        - 巨量粘贴自动落盘 .kiro/paste 并以 @ 引用（P2）',
        '        - 上下文 60%/80% 阈值提醒 + 用量条变色（P3）',
        '        - README 头与 .kiro/skills 注入（kiro 常载对齐，P4）',
        '        - 状态栏首字延迟（P8）',
        '        - 内置变更护栏：生产/仓库外配置改动先确认（P11）',
        '  0.3.x  kiro 差距补齐：@文件补全 / steering 注入 / 审批 diff /',
        '        todo 清单 / hooks 与 steering 热重载 / 审批项目级持久化',
        '  0.1.0  initial release — phase 1 skeleton + phase 2 interaction + phase 3 commands',
        '        https://github.com/damomoashidamomo/dsh-kiro/releases',
      ].join('\n'),
    }
  },
}
