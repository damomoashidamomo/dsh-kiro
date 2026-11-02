/**
 * `/retry` — resubmit the last user prompt (typically after a failed turn:
 * timeout, rate limit, network). Reads the transcript via the controller,
 * resubmits through the runtime's submit path.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/retry
 */
export const retryCommand = {
    name: 'retry',
    description: 'Resend the last prompt (after a failed turn)',
    handler: async ({ agent }) => {
        const ctx = agent.ctx;
        const get = ctx?.get;
        const service = typeof get === 'function'
            ? get.call(ctx, 'kiroRetry')
            : undefined;
        if (service?.submit === undefined) {
            return { kind: 'error', text: '/retry: 重发服务不可用' };
        }
        const text = service.lastUserPrompt?.();
        if (text === undefined) {
            return { kind: 'error', text: '/retry: 没有可重发的提问（转录里没有用户消息）。' };
        }
        service.submit(text);
        return { kind: 'success', text: `↻ 已重发：${text.length > 60 ? `${text.slice(0, 60)}…` : text}` };
    },
};
//# sourceMappingURL=retry.js.map