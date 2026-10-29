import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

/**
 * /workspace — show the session workspace (fixed at agent creation; all
 * tools and the sandbox anchor to it). Switching workspaces = launching
 * dsh in another directory (new session).
 */
export const workspaceCommand: CommandDefinition = {
  name: 'workspace',
  description: 'Show the session workspace directory',
  handler: async ({ agent }) => {
    const session = (agent as unknown as { session?: { header?: { cwd?: string } } }).session
    const cwd = session?.header?.cwd ?? process.cwd()
    return {
      kind: 'success',
      text: [
        `工作区：${cwd}`,
        '',
        '会话工作区在创建时固定——所有文件工具与 bash 沙箱都锚定此目录。',
        '要切换工作区：退出后在新目录重新启动 dsh，或启动时用 --cwd 指定：',
        '  dsh --profile kiro --cwd /path/to/project',
      ].join('\n'),
    }
  },
}
