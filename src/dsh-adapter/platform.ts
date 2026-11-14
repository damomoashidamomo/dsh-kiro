/**
 * 平台运行时函数的受控再出口（A2：内核零平台 import 的最后一步）。
 *
 * 内核文件不再直接 import `@deepseek-ai/dsh-*` 的运行时导出——统一从这里拿。
 * 这里是适配层的一部分：升级 DSH 时，若某个函数消失/改名，影响面收敛到
 * 本文件 + 契约测试（tests/dsh-adapter.spec.ts 的 expanded contracts）。
 *
 * 只允许 re-export；禁止在此添加任何逻辑。
 *
 * @module @damomoashidamomo/dsh-kiro/dsh-adapter/platform
 */

export { brandString } from '@deepseek-ai/dsh-brand'
export { SessionId } from '@deepseek-ai/dsh-session'
export { createUserMessage } from '@deepseek-ai/dsh-llm'
export { installModelSelection } from '@deepseek-ai/dsh-agent'
export { parseCommand } from '@deepseek-ai/dsh-commands'
export { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
export { parseCmdline } from '@deepseek-ai/dsh-cmdline'
export type { AppExit } from '@deepseek-ai/dsh-cmdline'
export {
  matchesMatcher,
  runHook,
  mergeHookOutputs,
  appendHookInvoked,
  appendHookResult,
  createDetachedRuns,
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_STDERR_SUMMARY_MAX_CHARS,
} from '@deepseek-ai/dsh-hook-protocol'
