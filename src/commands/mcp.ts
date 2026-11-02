/**
 * `/mcp` — MCP server panel (B-1): status table from the kiro-mcp manager
 * (configured / starting / ok / error + advertised tools), config-source
 * paths, and an add-your-first-server guide. add/remove stay config-file
 * edits until the phase-5 live spawner ships.
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface StatusLike {
  readonly config: { name: string; command?: string; args?: readonly string[]; url?: string }
  readonly started: boolean
  readonly state: 'configured' | 'starting' | 'ok' | 'error'
  readonly tools: readonly string[]
  readonly error?: string
}

const CONFIG_PATHS = [
  join(process.cwd(), '.kiro', 'settings', 'mcp.json'),
  join(homedir(), '.kiro', 'settings', 'mcp.json'),
]

const STATE_LABEL: Record<StatusLike['state'], string> = {
  configured: '· 已配置（未启动）',
  starting: '◔ 启动中',
  ok: '✓ 运行中',
  error: '✗ 失败',
}

function guide(): string {
  return [
    '添加 MCP 服务器：编辑以下任一文件（工作区级优先）——',
    ...CONFIG_PATHS.map((p) => `  ${p}`),
    '格式示例：',
    '  {',
    '    "mcpServers": {',
    '      "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"] }',
    '    }',
    '  }',
    '保存后重启 dsh 生效；/mcp 查看状态。',
  ].join('\n')
}

function table(statuses: readonly StatusLike[]): string {
  const lines = [`${statuses.length} 个 MCP 服务器：`]
  for (const st of statuses) {
    const transport = st.config.url !== undefined
      ? `url=${st.config.url}`
      : `cmd=${st.config.command ?? '?'}${(st.config.args ?? []).length > 0 ? ' ' + (st.config.args ?? []).join(' ') : ''}`
    lines.push(`  ${STATE_LABEL[st.state]}  ${st.config.name}  (${transport})`)
    if (st.tools.length > 0) {
      lines.push(`      工具：${st.tools.join(' · ')}`)
    }
    if (st.state === 'error' && st.error !== undefined) {
      lines.push(`      错误：${st.error.slice(0, 140)}`)
    }
  }
  return lines.join('\n')
}

export const mcpCommand: CommandDefinition = {
  name: 'mcp',
  description: 'MCP servers: status table, config guide',
  input: { hint: '[status]' },
  handler: async ({ agent }) => {
    const ctx = (agent as { ctx?: unknown }).ctx
    const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
    const manager = typeof get === 'function'
      ? get.call(ctx, 'kiroMcp') as { list?: () => readonly StatusLike[] } | undefined
      : undefined
    const statuses = manager?.list?.() ?? []
    if (statuses.length === 0) {
      return { kind: 'success', text: ['未配置 MCP 服务器。', '', guide()].join('\n') }
    }
    return { kind: 'success', text: table(statuses) }
  },
}
