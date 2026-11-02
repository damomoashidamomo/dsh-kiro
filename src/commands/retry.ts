/**
 * `/retry` — resubmit the last user prompt (typically after a failed turn:
 * timeout, rate limit, network). Reads the transcript via the controller,
 * resubmits through the runtime's submit path.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/retry
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

export const retryCommand: CommandDefinition = {
  name: 'retry',
  description: 'Resend the last prompt (after a failed turn)',
  handler: async ({ agent }) => {
    const ctx = (agent as { ctx?: unknown }).ctx
    const get = (ctx as { get?: (name: string) => unknown } | undefined)?.get
    const service = typeof get === 'function'
      ? get.call(ctx, 'kiroRetry') as
        | { lastUserPrompt?: () => string | undefined; submit?: (text: string) => void }
        | undefined
      : undefined
    if (service?.submit === undefined) {
      return { kind: 'error', text: '/retry: 重发服务不可用' }
    }
    const text = service.lastUserPrompt?.()
    if (text === undefined) {
      return { kind: 'error', text: '/retry: 没有可重发的提问（转录里没有用户消息）。' }
    }
    service.submit(text)
    return { kind: 'success', text: `↻ 已重发：${text.length > 60 ? `${text.slice(0, 60)}…` : text}` }
  },
}
