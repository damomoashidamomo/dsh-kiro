import { stubCommand } from './stub'

export const modeCommand = stubCommand(
  'mode',
  'Switch Kiro agent mode: vibe | spec',
  '<vibe|spec>',
)
