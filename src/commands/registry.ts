/**
 * Slash command registry facade. The actual command registrations live in
 * their own files; this module gathers them, exposes a discoverable catalog
 * for the slash menu, and provides the dispatch entry point.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/registry
 */

import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { helpCommand } from './help'
import { clearCommand } from './clear'
import { quitCommand } from './quit'
import { chatCommand } from './chat'
import { contextCommand } from './context'
import { agentCommand } from './agent'
import { modelCommand } from './model'
import { effortCommand } from './effort'
import { modeCommand } from './mode'
import { editorCommand } from './editor'
import { replyCommand } from './reply'
import { planCommand } from './plan'
import { compactCommand } from './compact'
import { todoCommand } from './todos'
import { toolsCommand } from './tools'
import { mcpCommand } from './mcp'
import { checkpointCommand } from './checkpoint'
import { knowledgeCommand } from './knowledge'
import { tangentCommand } from './tangent'
import { promptsCommand } from './prompts'
import { hooksCommand } from './hooks'
import { usageCommand } from './usage'
import { issueCommand } from './issue'
import { changelogCommand } from './changelog'
import { experimentCommand } from './experiment'
import { codeCommand } from './code'
import { pasteCommand } from './paste'

/** Catalog of all slash commands shipped with dsh-kiro. */
export const ALL_COMMANDS: readonly CommandDefinition[] = [
  helpCommand,
  clearCommand,
  quitCommand,
  chatCommand,
  contextCommand,
  agentCommand,
  modelCommand,
  effortCommand,
  modeCommand,
  editorCommand,
  replyCommand,
  planCommand,
  compactCommand,
  todoCommand,
  toolsCommand,
  mcpCommand,
  checkpointCommand,
  knowledgeCommand,
  tangentCommand,
  promptsCommand,
  hooksCommand,
  usageCommand,
  issueCommand,
  changelogCommand,
  experimentCommand,
  codeCommand,
  pasteCommand,
]

/** Grouping for the slash-menu rendering. */
export interface CommandGroup {
  readonly title: string
  readonly items: readonly CommandDefinition[]
}

const CORE_ITEMS = ['help', 'clear', 'quit']
const CHAT_ITEMS = ['chat', 'context', 'reply', 'editor', 'paste']
const AGENT_ITEMS = ['agent', 'model', 'effort', 'mode']
const WORKFLOW_ITEMS = ['plan', 'todos', 'checkpoint', 'tangent']
const INTEGRATIONS_ITEMS = ['tools', 'mcp', 'code', 'prompts', 'hooks']
const KNOWLEDGE_ITEMS = ['knowledge', 'usage']
const META_ITEMS = ['issue', 'changelog', 'experiment']

/** Group commands by surface for the slash menu. */
export function groupCommands(): readonly CommandGroup[] {
  const byName = new Map(ALL_COMMANDS.map(cmd => [cmd.name, cmd]))
  const make = (names: readonly string[]): CommandDefinition[] =>
    names.map(name => byName.get(name)).filter((cmd): cmd is CommandDefinition => cmd !== undefined)
  return [
    { title: 'Core', items: make(CORE_ITEMS) },
    { title: 'Conversation', items: make(CHAT_ITEMS) },
    { title: 'Agent', items: make(AGENT_ITEMS) },
    { title: 'Workflow', items: make(WORKFLOW_ITEMS) },
    { title: 'Integrations', items: make(INTEGRATIONS_ITEMS) },
    { title: 'Knowledge', items: make(KNOWLEDGE_ITEMS) },
    { title: 'Meta', items: make(META_ITEMS) },
  ]
}

/** Look up a command by name (case-insensitive). */
export function findCommand(name: string): CommandDefinition | undefined {
  const lower = name.toLowerCase()
  return ALL_COMMANDS.find(cmd => cmd.name === lower)
}
