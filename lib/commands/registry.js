/**
 * Slash command registry facade. The actual command registrations live in
 * their own files; this module gathers them, exposes a discoverable catalog
 * for the slash menu, and provides the dispatch entry point.
 *
 * @module @damomoashidamomo/dsh-kiro/commands/registry
 */
import { helpCommand } from "./help.js";
import { clearCommand } from "./clear.js";
import { quitCommand } from "./quit.js";
import { chatCommand } from "./chat.js";
import { contextCommand } from "./context.js";
import { agentCommand } from "./agent.js";
import { modelCommand } from "./model.js";
import { effortCommand } from "./effort.js";
import { modeCommand } from "./mode.js";
import { editorCommand } from "./editor.js";
import { replyCommand } from "./reply.js";
import { planCommand } from "./plan.js";
import { compactCommand } from "./compact.js";
import { todoCommand } from "./todos.js";
import { toolsCommand } from "./tools.js";
import { mcpCommand } from "./mcp.js";
import { checkpointCommand } from "./checkpoint.js";
import { knowledgeCommand } from "./knowledge.js";
import { tangentCommand } from "./tangent.js";
import { promptsCommand } from "./prompts.js";
import { hooksCommand } from "./hooks.js";
import { usageCommand } from "./usage.js";
import { issueCommand } from "./issue.js";
import { changelogCommand } from "./changelog.js";
import { experimentCommand } from "./experiment.js";
import { codeCommand } from "./code.js";
import { pasteCommand } from "./paste.js";
/** Catalog of all slash commands shipped with dsh-kiro. */
export const ALL_COMMANDS = [
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
];
const CORE_ITEMS = ['help', 'clear', 'quit'];
const CHAT_ITEMS = ['chat', 'context', 'reply', 'editor', 'paste'];
const AGENT_ITEMS = ['agent', 'model', 'effort', 'mode'];
const WORKFLOW_ITEMS = ['plan', 'todos', 'checkpoint', 'tangent'];
const INTEGRATIONS_ITEMS = ['tools', 'mcp', 'code', 'prompts', 'hooks'];
const KNOWLEDGE_ITEMS = ['knowledge', 'usage'];
const META_ITEMS = ['issue', 'changelog', 'experiment'];
/** Group commands by surface for the slash menu. */
export function groupCommands() {
    const byName = new Map(ALL_COMMANDS.map(cmd => [cmd.name, cmd]));
    const make = (names) => names.map(name => byName.get(name)).filter((cmd) => cmd !== undefined);
    return [
        { title: 'Core', items: make(CORE_ITEMS) },
        { title: 'Conversation', items: make(CHAT_ITEMS) },
        { title: 'Agent', items: make(AGENT_ITEMS) },
        { title: 'Workflow', items: make(WORKFLOW_ITEMS) },
        { title: 'Integrations', items: make(INTEGRATIONS_ITEMS) },
        { title: 'Knowledge', items: make(KNOWLEDGE_ITEMS) },
        { title: 'Meta', items: make(META_ITEMS) },
    ];
}
/** Look up a command by name (case-insensitive). */
export function findCommand(name) {
    const lower = name.toLowerCase();
    return ALL_COMMANDS.find(cmd => cmd.name === lower);
}
//# sourceMappingURL=registry.js.map