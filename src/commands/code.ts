import { stubCommand } from './stub'

export const codeCommand = stubCommand(
  'code',
  'Code intelligence (LSP): init, status, logs, overview, summary',
  '<init|status|logs|overview|summary>',
)
