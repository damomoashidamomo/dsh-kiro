# dsh-kiro

A Kiro-CLI-equivalent **terminal UI** bundle for the [DeepSeek Harness][dsh].
Same agents, same intelligence — rendered in a rich Ink + React terminal with
markdown, syntax-highlighted code blocks, status bar, slash-command palette,
tool-call cards, and progress overlays.

Dark-green themed. Designed for the single-session terminal use-case where you
want the same `dsh` agent in your shell without spinning up the Web UI.

## Features (target parity with `kiro-cli`)

| Surface | Status |
| --- | --- |
| Rich terminal UI (markdown, code highlighting, status bar) | ✅ Phase 1 |
| Slash command registry (25 commands) | ✅ Phase 1 (3 implemented + 22 stubs) |
| Custom agents from `.kiro/agents/` and `~/.kiro/agents/` | 🟡 Phase 4 |
| Steering files from `.kiro/steering/*.md` | 🟡 Phase 4 |
| Native MCP server management | 🟡 Phase 4 |
| Subagent delegation, plan mode, model selection | 🟡 Phase 4 |
| Tool trust / untrust / `--trust-all-tools` | 🟡 Phase 3 |
| Session resume, list, delete, picker | 🟡 Phase 3 |
| Checkpointing (git shadow repo) | ✅ Phase 5 |
| Knowledge base (BM25 + optional embeddings) | ✅ Phase 5 |
| LSP code intelligence (TS / Py / Rust / Go / Java / Ruby / C++ / Kotlin) | 🟡 Stubbed (config in cordis.patch, full client lands after MCP wiring) |
| Tangent side-conversations | 🟡 Stubbed (Ctrl+T reserved; lifecycle ships alongside the Agent Team profile) |

See the "Implementation Status" section below for the full rollout plan.

## Installation

```bash
# From a fresh DSH install
dsh plugin --profile kiro add github:damomoashidamomo/dsh-kiro
dsh --profile kiro
```

Upgrades:

```bash
dsh plugin --profile kiro update
```

Uninstall:

```bash
dsh plugin --profile kiro remove @damomoashidamomo/dsh-kiro
```

The plugin needs **Node ≥ 22** (aligned with DeepSeek Harness main line).

## Usage

```bash
# Start a fresh session
dsh --profile kiro

# Seed the first prompt
dsh --profile kiro "fix the failing test in src/foo.spec.ts"

# Resume the most recent session in the current directory
dsh --profile kiro -r

# Pick a session interactively
dsh --profile kiro --resume-picker

# Use a custom agent (lives under .kiro/agents/ or ~/.kiro/agents/)
dsh --profile kiro --agent backend-specialist

# Run non-interactively (CI-friendly)
dsh --profile kiro --no-interactive "refactor: extract a foo() helper"

# List models and exit
dsh --profile kiro --list-models
```

### CLI flags

| Flag | Description |
| --- | --- |
| `-r, --resume` | Resume the most recent session in cwd |
| `--resume-id <id>` | Resume a specific session by id |
| `--resume-picker`, `--list` | Open the resume picker before booting |
| `-l, --list-sessions` | List stored sessions and exit |
| `-d, --delete-session <id>` | Delete a stored session |
| `--session-source <v1\|v2>` | Restrict session lookup to one storage source |
| `--list-models` | List available models and exit |
| `--agent <name>` | Start with a custom agent |
| `--model <provider/model>` | Override the model the agent selects |
| `--effort <low\|medium\|high\|xhigh\|max>` | Reasoning-effort override |
| `--agent-engine <v2\|v1\|kas>` | Agent engine (default `v2`) |
| `--mode <vibe\|spec>` | Agent mode |
| `-a, --trust-all-tools` | Pre-trust every built-in tool |
| `--trust-tools <list>` | Pre-trust a comma-separated tool list |
| `--no-interactive` | Run non-interactively, then exit |
| `-f, --format <plain\|json\|json-pretty>` | Output format for non-interactive mode |
| `--require-mcp-startup` | Fail boot if an MCP server does not start |
| `--tui` / `--legacy` | TUI (default) or legacy surface |
| `-w, --wrap <always\|never\|auto>` | Wrap long lines in the transcript |
| `-v, --verbose` | Increase verbosity (repeatable) |
| `-h, --help` | Show this help |

### Key bindings

| Key | Action |
| --- | --- |
| `Enter` | Submit the prompt |
| `Shift+Enter` | Insert newline (multi-line prompt) |
| `Ctrl+C` | Interrupt the current turn |
| `Ctrl+D` | Quit the TUI |
| `Ctrl+K` | Open the slash-command fuzzy palette |
| `Ctrl+L` | Clear the screen |
| `Ctrl+O` | Open the context picker |
| `Ctrl+T` | Toggle tangent mode |
| `Shift+Tab` | Toggle plan mode |
| `↑` / `↓` | Browse input history |
| `Tab` | Accept auto-complete |
| `Esc` | Cancel the current operation |
| `!` (prefix) | Execute a shell command directly |
| `@` (prefix) | Reference a saved prompt or MCP tool |

Native terminal selection works everywhere: drag with the mouse to select,
right-click in Windows Terminal / WSL to paste. Ink never intercepts mouse
events, so the terminal's own selection behaves as usual.

### Slash commands

Phase 1 ships the full **registry** of 25 commands so `/help` is complete
from day one. Three are real implementations; the rest are placeholders that
return a polite "phase 3+" message. They will be filled in over the coming
phases.

| Group | Commands |
| --- | --- |
| Core | `/help` `/clear` `/quit` |
| Conversation | `/chat` `/context` `/reply` `/editor` `/paste` |
| Agent | `/agent` `/model` `/effort` `/mode` |
| Workflow | `/plan` `/todos` `/checkpoint` `/tangent` |
| Integrations | `/tools` `/mcp` `/code` `/prompts` `/hooks` |
| Knowledge | `/knowledge` `/usage` |
| Meta | `/issue` `/changelog` `/experiment` |

## File layout

```
~/.kiro/
├── agents/                       # custom agents (JSON)
├── settings/
│   ├── mcp.json                  # MCP servers
│   ├── trusted-tools.json        # tool trust store
│   └── settings.json             # chat defaults
├── cli-todo-lists/               # persisted TODO lists
└── history/                      # prompt history

<cwd>/.kiro/
├── agents/                       # project-scoped custom agents
├── steering/                     # markdown rules injected into the system prompt
├── settings/mcp.json             # project-scoped MCP servers
├── knowledge/                    # BM25 index files
├── checkpoints/                  # git shadow repo
└── sessions/                     # session storage override
```

## Architecture

```
Cordis Context (kiro profile tree)
  │ session/event bus, ctx.commands, ctx.skills, ctx.approval, ctx.userQuestions
  ▼
SessionController (src/runtime/session-controller.ts)
  │ projects session/event → Zustand-shaped render state
  ▼
Ink React App (src/ui/App.tsx)
  ├─ Transcript (user / assistant / tool messages, streaming)
  ├─ ToolCard (state machine + output + duration)
  ├─ StatusBar (agent / model / status / token usage)
  ├─ Prompt (multi-line + history + @ / ! triggers)
  └─ Overlays on demand: slash menu, model picker, agent picker, …
```

`cordis.patch.yml` re-enables every base row the Web surface disables (the
TUI is single-session and owns its agent process-wide) and inserts 12 kiro
plugins: `kiro-startup`, `kiro-runtime`, `kiro-commands`, `kiro-agents`,
`kiro-steering`, `kiro-mcp`, `kiro-trust`, `kiro-lsp`, `kiro-checkpoint`,
`kiro-knowledge`, `kiro-tangent`.

## Implementation Status

- **Phase 1 ✅ — skeleton**: package layout, theme, startup CLI, Ink entry,
  session controller, transcript/prompt/status bar, markdown rendering,
  slash command registry with all 25 entries visible in `/help`.
- **Phase 2 ✅ — core interaction**: multi-line editor, `@` autocomplete,
  `!` shell escape, ToolCard state machine, ProgressOverlay, Ctrl+K
  slash-command fuzzy palette.
- **Phase 3 ✅ — commands**: every slash command implemented end-to-end plus
  tool-trust store at `~/.kiro/settings/trusted-tools.json` with
  `/tools list|trust|untrust|trust-all|reset`.
- **Phase 4 ✅ — agent subsystem**: custom agents loader (`.kiro/agents/`
  + `~/.kiro/agents/`), steering files loader (frontmatter + glob
  matching), MCP config manager (status table, transport normalization).
- **Phase 5 ✅ — advanced**: git-shadow checkpoint manager with snapshot /
  restore / diff / clean, BM25 knowledge base with add / remove / clear /
  query, with real implementations behind `/checkpoint` and `/knowledge`.

LSP code-intelligence and tangent mode ship as stubs in this release —
their plugins (`kiro-lsp`, `kiro-tangent`) are mounted and reserved, but the
heavy lifting (LSP client pool, tangent session fork) lands once the
MCP / Agent Team profiles upstream mature.

## Development

```bash
# Install deps (uses peer ranges, the host profile resolves them)
pnpm install

# Type-check
pnpm typecheck

# Unit tests
pnpm test

# Build to lib/
pnpm build
```

## License

MIT © [damomoashidamomo](https://github.com/damomoashidamomo)

[dsh]: https://github.com/deepseek-ai/deepseek-harness
