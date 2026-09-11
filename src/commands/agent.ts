import { stubCommand } from './stub'

export const agentCommand = stubCommand(
  'agent',
  'Manage custom agents: list, swap, create, edit, delete, show',
  '<list|swap|create|edit|delete|show|generate> [args]',
)
