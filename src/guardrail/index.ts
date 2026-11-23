/**
 * kiro-guardrail — the confirm-first mindset as a built-in system-prompt
 * section (P11, from the kiro-habits analysis): before mutating production
 * environments (service restarts, deployments, cluster operations) or
 * writing configuration outside the repository, the agent must state its
 * plan and impact and wait for explicit approval. Project steering loaded
 * later in the prompt can sharpen or relax this rule.
 *
 * @module @damomoashidamomo/dsh-kiro/guardrail
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'kiro-guardrail'

/** The section's fixed guidance text. */
export const GUARDRAIL_TEXT = [
  '## 变更护栏（dsh-kiro 内置）',
  '',
  '涉及生产环境变更（服务启停/重启、部署、集群与网络操作、删除或覆盖数据）或修改仓库之外的配置文件时：',
  '1. 先陈述计划：要做什么、影响面（哪些服务/节点/文件）、回滚方式；',
  '2. 等待用户明确批准后再执行；用户说"直接做/不用问"的，本轮可免重复确认；',
  '3. 仓库内的常规代码编辑不受此约束。',
  '',
  '宁可多问一句，不可替用户决定生产变更。',
  '',
  '## 终端排版护栏（dsh-kiro 内置）',
  '',
  '输出宽度以约 100 列终端为准：',
  '1. 对比表格控制在 ≤5 列；列数更多时优先改用逐项清单或分组小表；',
  '2. 单元格内容避免长链接/长描述直接入表——链接放表格下方脚注，描述精简到短语；',
  '3. 用户明确要求完整表格时除外；',
  '4. 给用户手动执行的多条 shell 命令：合并进一个代码块、每行一条（不要拆成多个独立代码块）；',
  '5. 每条单行命令 ≤90 列（终端约 100 列，超出会被截断看不到）。更长的逻辑必须改写成',
  '   真·多行脚本（真实换行 + 缩进），禁止塞成超长单行；python 内嵌代码用真实多行，',
  '   不要用分号/推导式压成一行。',
].join('\n')

/** Mount the guardrail section (order 640, before kiro:steering at 650). */
export function apply(ctx: Context): void {
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'kiro:guardrail',
      // Just below steering (650): a baseline the project can override.
      order: 640,
      text: () => GUARDRAIL_TEXT,
    })
  })
}
