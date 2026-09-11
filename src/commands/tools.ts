import { stubCommand } from './stub'

export const toolsCommand = stubCommand(
  'tools',
  'View tool trust status; trust/untrust/reset individual tools',
  '<trust|untrust|reset|list> [name]',
)
