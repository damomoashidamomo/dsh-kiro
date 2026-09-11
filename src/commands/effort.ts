import { stubCommand } from './stub'

export const effortCommand = stubCommand(
  'effort',
  'Set reasoning-effort: low | medium | high | xhigh | max',
  '<level>',
)
