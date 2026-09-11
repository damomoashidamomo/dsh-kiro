import { stubCommand } from './stub'

export const experimentCommand = stubCommand(
  'experiment',
  'Toggle experimental features: knowledge, thinking, tangent, todos, checkpoint, delegate',
  '<feature> [on|off]',
)
