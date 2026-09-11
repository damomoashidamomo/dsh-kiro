import { stubCommand } from './stub'

export const promptsCommand = stubCommand(
  'prompts',
  'Manage saved prompts — list, get, create, edit, remove',
  '<list|get|create|edit|remove>',
)
