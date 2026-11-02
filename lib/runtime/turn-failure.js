/**
 * Turn-failure classification — turn an LlmFailure-shaped error into an
 * actionable, human-readable hint instead of a bare "Request timed out".
 *
 * The platform's llm-retry layer already retried whatever its policy
 * covers; what reaches `turn/end` is the post-retry failure. The user's
 * remaining moves are: wait the requested backoff, resend the same prompt,
 * or switch models — so the hint names the concrete next step per class.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/turn-failure
 */
const seconds = (ms) => `${Math.ceil(ms / 1000)}s`;
/** Classify a failed turn's error payload. */
export function classifyTurnFailure(error, message) {
    const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
    const status = typeof error?.status === 'number' ? error.status : undefined;
    const retryAfter = typeof error?.providerRetryAfterMs === 'number' && error.providerRetryAfterMs > 0
        ? error.providerRetryAfterMs
        : undefined;
    const blob = `${code} ${message}`.toLowerCase();
    const retryLine = retryLineFor(retryAfter);
    if (status === 429 || blob.includes('rate') || blob.includes('quota') || blob.includes('429')) {
        return {
            kind: 'rate-limit',
            transient: true,
            text: [
                `✗ 回合失败（限流）：${message}`,
                `↳ 触发了网关限流。${retryLine ?? '稍等十几秒再试'}；重发用 /retry 或 ↑ 选回原提问。`,
            ].join('\n'),
        };
    }
    if (blob.includes('timeout') || blob.includes('timed out') || blob.includes('etimedout')) {
        return {
            kind: 'timeout',
            transient: true,
            text: [
                `✗ 回合失败（超时）：${message}`,
                '↳ 多为网络抖动或网关拥塞。/retry 重发同一提问；连续超时可 /model 换一个模型，',
                '  或稍等片刻再试（长提问可拆短）。',
            ].join('\n'),
        };
    }
    if (status !== undefined && status >= 500) {
        return {
            kind: 'server',
            transient: true,
            text: [
                `✗ 回合失败（服务端 ${status}）：${message}`,
                `↳ 网关/模型服务出错。${retryLine ?? '稍等后'}用 /retry 重发；反复失败建议 /model 切换。`,
            ].join('\n'),
        };
    }
    if (status === 401 || status === 403 || blob.includes('unauthorized') || blob.includes('api key') || blob.includes('forbidden')) {
        return {
            kind: 'auth',
            transient: false,
            text: [
                `✗ 回合失败（鉴权）：${message}`,
                '↳ API Key 无效或无权限。检查 settings 里该 provider 的 apiKeyEnv 是否配置正确。',
            ].join('\n'),
        };
    }
    if (blob.includes('econnrefused') || blob.includes('enotfound') || blob.includes('eai_again')
        || blob.includes('network') || blob.includes('fetch failed') || blob.includes('socket')) {
        return {
            kind: 'network',
            transient: true,
            text: [
                `✗ 回合失败（网络）：${message}`,
                '↳ 连不上模型端点。检查网络/代理是否放行该网关域名；恢复后 /retry 重发。',
            ].join('\n'),
        };
    }
    if (status === 404 || blob.includes('model') && (blob.includes('not found') || blob.includes('invalid') || blob.includes('unknown'))) {
        return {
            kind: 'model',
            transient: false,
            text: [
                `✗ 回合失败（模型）：${message}`,
                '↳ 模型名可能无效。用 /model 查看可用模型并切换。',
            ].join('\n'),
        };
    }
    return {
        kind: 'unknown',
        transient: false,
        text: [
            `✗ 回合失败：${message}`,
            '↳ 可用 /retry 重发，或 /model 切换后重试。',
        ].join('\n'),
    };
}
function retryLineFor(retryAfter) {
    return retryAfter !== undefined ? `服务端建议等待 ${seconds(retryAfter)} 后` : undefined;
}
//# sourceMappingURL=turn-failure.js.map