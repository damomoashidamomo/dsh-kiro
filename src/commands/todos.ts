import { stubCommand } from './stub'

export const todoCommand = stubCommand(
  'todos',
  'Manage TODO lists — view, resume, clear finished, delete',
  '<view|resume|clear-finished|delete> [args]',
)
