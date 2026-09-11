import { stubCommand } from './stub'

export const contextCommand = stubCommand(
  'context',
  'Add or remove files from the persistent session context',
  '<add|remove|show|clear> [path]',
)
