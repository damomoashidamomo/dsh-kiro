import { stubCommand } from './stub'

export const checkpointCommand = stubCommand(
  'checkpoint',
  'Workspace snapshots — init, list, expand, diff, restore, clean',
  '<init|list|expand|diff|restore|clean>',
)
