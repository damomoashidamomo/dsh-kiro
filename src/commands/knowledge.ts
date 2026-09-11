import { stubCommand } from './stub'

export const knowledgeCommand = stubCommand(
  'knowledge',
  'Manage the persistent knowledge base',
  '<add|show|remove|update|clear|cancel>',
)
