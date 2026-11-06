/**
 * App — the Ink root component. Lays out the Transcript, Splash, StatusBar,
 * Prompt, and the optional ProgressOverlay / SlashMenu.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */

import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Transcript } from './Transcript'
import { Prompt } from './Prompt'
import { StatusBar, identityText, shouldShowStatusBar } from './StatusBar'
import { ProgressOverlay } from './ProgressOverlay'
import { SlashMenu } from './SlashMenu'
import { OptionMenu, withSessionTitles, type OptionItem } from './OptionMenu'
import { PickerOverlay } from './PickerOverlay'
import { ApprovalOverlay } from './ApprovalOverlay'
import { PlanReviewOverlay } from './PlanReviewOverlay'
import { Autocomplete, rankCandidates, slashCandidates, type AutocompleteItem } from './Autocomplete'
import { pickerFor } from '../commands/subcommands'
import { chatPickerRows, sessionRowBudget } from './pickerRows'
import { STRINGS } from './strings'
import { banner, palette } from '../theme/palette'
import { splashMark } from '../theme/banner'
import Fuse from 'fuse.js'
import { setMarkdownColumns } from '../markdown/render'
import { buildEditDiff, isEditableTool, type DiffRow } from './diff'
import type { SessionController } from '../runtime/session-controller'
import type { SessionRenderState } from '../runtime/types'
import { mapKey } from '../runtime/keybindings'
import { ALL_COMMANDS } from '../commands/registry'

/**
 * Diff rows for a pending approval: match the most recent tool-call record
 * of the named tool and build red/green rows from its recorded arguments.
 */
/** The shell command of the pending bash request, for scope trust. */
function approvalCommandOf(state: SessionRenderState, toolName: string): string | undefined {
  if (toolName !== 'bash') return undefined
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i]
    if (message?.kind === 'tool-call' && message.tool?.name === toolName) {
      try {
        const args = JSON.parse(message.tool.argsRaw ?? '{}') as { command?: unknown }
        return typeof args.command === 'string' ? args.command : undefined
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

function approvalDiff(state: SessionRenderState, toolName: string): readonly DiffRow[] | undefined {
  if (!isEditableTool(toolName)) return undefined
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const message = state.messages[i]
    if (message?.kind === 'tool-call' && message.tool?.name === toolName) {
      return buildEditDiff(toolName, message.tool.argsRaw)
    }
  }
  return undefined
}

/** Printed on the first Ctrl+C / Ctrl+D while idle (kiro-cli's wording). */
const EXIT_HINT = '(To exit the CLI, press Ctrl+C or Ctrl+D again or type /quit)'

/**
 * The hint printed on the first Ctrl+C / Ctrl+D. kiro-cli prints the English
 * line on its own; this TUI is mostly Chinese, so the gloss rides along.
 */
const EXIT_HINT_TEXT = `${EXIT_HINT}\n（再按一次 Ctrl+C 或 Ctrl+D 退出，或输入 /quit）`

export interface AppProps {
  /**
   * Workspace `@`-mention lookup (platform fileReferences service):
   * resolves a query fragment to file/directory candidates.
   */
  readonly fileSearch?: (query: string) => Promise<readonly AutocompleteItem[]> | undefined
  controller: SessionController
  seedTask?: string | undefined
  activeAgentName?: string | undefined
  onSubmit: (text: string) => void
}

/** Render the TUI. */
export function App({ controller, seedTask, activeAgentName, onSubmit, fileSearch }: AppProps): JSX.Element {
  const { exit } = useApp()
  const [state, setState] = useState<SessionRenderState>(() => controller.getState())
  const [prefix, setPrefix] = useState<'/' | '@' | '!' | undefined>(undefined)
  const [seeded, setSeeded] = useState<boolean>(seedTask === undefined)
  const [slashMenuOpen, setSlashMenuOpen] = useState<boolean>(false)
  const [optionMenu, setOptionMenu] = useState<
    | { title: string; options: readonly OptionItem[]; apply: (value: string) => void }
    | undefined
  >(undefined)
  const [prefixQuery, setPrefixQuery] = useState<string>('')
  const [autocompleteSelected, setAutocompleteSelected] = useState<number>(0)
  /** Submitted drafts, ↑/↓ recall (oldest first). */
  const [submitHistory, setSubmitHistory] = useState<readonly string[]>([])
  const [atItems, setAtItems] = useState<readonly AutocompleteItem[]>([])
  const [atInsert, setAtInsert] = useState<{
    token: string
    insert: string
    seq: number
    clearAll?: boolean
    replace?: string
  } | undefined>(undefined)
  const insertSeq = useRef(0)

  // @-mention candidates: debounced workspace lookup while the @ popup is up.
  useEffect(() => {
    if (prefix !== '@' || fileSearch === undefined) {
      setAtItems([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      Promise.resolve(fileSearch(prefixQuery))
        .then((items) => { if (!cancelled) setAtItems(items ?? []) })
        .catch(() => { if (!cancelled) setAtItems([]) })
    }, 120)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [prefix, prefixQuery, fileSearch])
  /** Abort the in-flight LLM request (Ctrl+C first press). */
  const cancelTurn = (): void => {
    controller.cancelActiveTurn()
  }

  // kiro-style two-stage exit. Two different presses share this arming:
  //  - a turn is running: the first Ctrl+C cancels it, the second exits;
  //  - idle: the first Ctrl+C / Ctrl+D only clears the draft and prints the
  //    hint, the second exits. kiro-cli 1.27 behaves exactly like that, and the
  //    arming does not time out (a second press 12 s later still exits).
  const interruptArmed = useRef<boolean>(false)

  useEffect(() => controller.subscribe(setState), [controller])

  // Submitting a prompt disarms the exit: the next Ctrl+C starts over. (The
  // arming itself is NOT cleared when a cancelled turn returns to idle — kiro
  // keeps the hint live, so an immediate second press still exits.)
  const disarmExit = useCallback(() => {
    interruptArmed.current = false
  }, [])


  useEffect(() => {
    if (seeded) return
    if (seedTask !== undefined && seedTask !== '') {
      onSubmit(seedTask)
    }
    setSeeded(true)
  }, [seeded, seedTask, onSubmit])

  // Top-level keybindings dispatch on top of the Prompt's own useInput. Ink
  // routes key events to all `useInput` subscribers in registration order.
  useInput((input, key) => {
    if (slashMenuOpen) return
    if (state.picker !== undefined) return
    if (state.overlay.kind !== 'none') return
    const action = mapKey({ input, key })
    if (action === 'quit' || action === 'interrupt') {
      const busy = state.agent.status === 'running' || state.agent.status === 'cancelling'
      if (busy) {
        // A running turn: the first Ctrl+C cancels, the second exits. Ctrl+D
        // never cancels — it only arms and exits on the second press.
        if (interruptArmed.current) {
          exit()
          return
        }
        interruptArmed.current = true
        if (action === 'interrupt') {
          controller.patchAgent({ status: 'cancelling' })
          cancelTurn()
        } else {
          controller.pushSystem(EXIT_HINT_TEXT)
        }
        return
      }
      // Idle: clear the draft and print the hint; only the second press exits.
      if (interruptArmed.current) {
        exit()
        return
      }
      interruptArmed.current = true
      insertSeq.current += 1
      setAtInsert({ token: '', insert: '', seq: insertSeq.current, clearAll: true })
      controller.pushSystem(EXIT_HINT_TEXT)
      return
    }
    if (state.approval !== undefined || state.question !== undefined) {
      // While the approval or plan-review panel waits, only quit/interrupt
      // stay live (the interrupt cancels the turn, which aborts the request).
      return
    } else if (action === 'clear-screen') {
      process.stdout.write('\x1b[2J\x1b[H')
    } else if (action === 'open-slash-menu') {
      setSlashMenuOpen(true)
    }
  }, { isActive: true })

  const { stdout } = useStdout()

  // Tell the markdown renderer how wide the pane is: tables cap to it and
  // code blocks truncate — wide content stops exploding the transcript.
  useEffect(() => {
    setMarkdownColumns(stdout?.columns !== undefined ? stdout.columns - 2 : undefined)
  }, [stdout?.columns])
  // Ink's <Static> container is absolutely positioned and hugs its content,
  // so flex centering inside it never spans the terminal width. Center the
  // splash by padding each line with spaces for the real column count.
  // Boot blink (B-10, decorative): the tagline dot pulses a few times in
  // the LIVE region, then the splash freezes into <Static> as the header —
  // animating a Static item would violate its print-once contract.
  const [splashBlink, setSplashBlink] = useState(false)
  const [splashSettled, setSplashSettled] = useState(false)
  useEffect(() => {
    let ticks = 0
    const timer = setInterval(() => {
      ticks += 1
      setSplashBlink((blink) => !blink)
      if (ticks >= 4) {
        clearInterval(timer)
        setSplashSettled(true)
      }
    }, 350)
    return () => clearInterval(timer)
  }, [])

  const splash = useMemo(() => {
    const raw = splashMark(stdout?.columns)
    const columns = stdout?.columns ?? 100
    const lines = raw.split('\n')
    const maxWidth = Math.max(0, ...lines.map((line) => line.replace(/\x1b\[[0-9;]*m/gu, '').length))
    const pad = Math.max(0, Math.floor((columns - maxWidth) / 2))
    if (pad === 0) return raw
    return lines.map((line) => ' '.repeat(pad) + line).join('\n')
  }, [stdout?.columns])

  // While blinking, the live splash swaps the tagline separator each frame.
  const liveSplash = useMemo(() => {
    if (splashSettled || !splashBlink) return undefined
    return splash.replace('Kiro CLI · DeepSeek Harness', 'Kiro CLI ◉ DeepSeek Harness')
  }, [splash, splashBlink, splashSettled])
  // The session identity is printed once into the transcript (kiro-cli's
  // `Model: auto (/model to change)` line). The live bar then only appears
  // when the identity diverges or a decision is pending — so at rest the last
  // transcript row (an echoed `0% >`) sits directly above the prompt.
  const bootIdentity = useRef<string | undefined>(undefined)
  const identity = identityText(state.agent, activeAgentName)
  useEffect(() => {
    if (bootIdentity.current !== undefined) return
    // The splash must be frozen into <Static> FIRST: it becomes staticItems[0],
    // and Ink's <Static> prints `items.slice(rendered)`. Appending a message
    // before the header would re-slice to the same message once the header
    // lands and print it a SECOND time (a duplicated boot line on screen).
    if (!splashSettled) return
    // Wait for the boot model resolution so the line does not say "pending";
    // fall back after a moment in case the provider never declares one.
    const known = state.agent.activeProvider !== undefined && state.agent.activeModel !== undefined
    const printBoot = (): void => {
      if (bootIdentity.current !== undefined) return
      bootIdentity.current = identity
      controller.appendBootInfo(identity)
    }
    if (known) {
      printBoot()
      return
    }
    const timer = setTimeout(printBoot, 2500)
    return () => clearTimeout(timer)
  }, [identity, splashSettled, state.agent.activeProvider, state.agent.activeModel, controller])

  // A shell echo (`0% >`) belongs right above the prompt, the way kiro-cli
  // stacks them; the Prompt's usual breathing gap would sit between the two.
  const lastIsPromptEcho = (() => {
    const last = state.messages[state.messages.length - 1]
    return last !== undefined && last.kind === 'echo' && last.id.startsWith('echo-')
  })()

  const activeToolName = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const msg = state.messages[i]
      if (msg?.kind === 'tool-call' && msg.streaming && msg.tool !== undefined) {
        return msg.tool.name
      }
    }
    return undefined
  }, [state.messages])

  // The '/' popup filters on the COMMAND NAME only — text after the first
  // space is arguments (`/chat resume`) and must not empty the match list.
  const slashQuery = (prefixQuery.split(/\s+/u)[0] ?? '').trim()

  function clipColumnsForMenu(text: string, width: number): string {
    if (width <= 1) return text.length > 0 ? '…' : ''
    let used = 0
    let out = ''
    for (const ch of text) {
      const w = ch.codePointAt(0) !== undefined && (ch.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1
      if (used + w > width - 1) return `${out}…`
      used += w
      out += ch
    }
    return out
  }

  /**
   * Build the option picker for a bare enumerated command.
   *
   * Rows come from the subcommand catalog (`commands/subcommands.ts`), so the
   * menu lists EVERY subcommand the handler accepts — the old hand-written
   * menus dropped some (`/chat` never showed `delete` or `help`) and most
   * multi-subcommand commands had no menu at all. Rows that need further
   * arguments PRE-FILL the prompt instead of submitting.
   */
  /**
   * `/cmd sub ` for a row that still needs arguments. Placeholder segments
   * (`<id>`, `<on|off>`) are dropped: the prompt must not contain them.
   */
  const prefillText = (name: string, value: string): string => {
    const bare = value.replace(/\s*<[^>]*>/gu, '').trim()
    return `/${name} ${bare} `
  }

  /** Write text into the prompt (no submit) — used by picker rows that need args. */
  const insertIntoPrompt = (text: string): void => {
    insertSeq.current += 1
    setAtInsert({ token: '', insert: '', seq: insertSeq.current, replace: text })
  }

  const optionMenuFor = (name: string): { title: string; options: readonly OptionItem[]; apply: (value: string) => void } | undefined => {
    const picker = pickerFor(name)
    if (picker === undefined) return undefined
    const rows: OptionItem[] = []
    const prefill = new Set<string>()
    for (const row of picker.rows) {
      rows.push({ value: row.value, label: clipColumnsForMenu(row.value, 26), hint: row.hint })
      if (row.needsArg === true) prefill.add(row.value)
    }
    // Dynamic rows: the concrete sessions / presets, right after the static
    // subcommands they belong to.
    if (name === 'chat') {
      const chatSvc = (globalThis as {
        __kiroChatList?: () => { total: number; sessions: readonly { id: string; title: string; when: string }[] }
      }).__kiroChatList
      const listing = chatSvc?.() ?? { total: 0, sessions: [] }
      const built = chatPickerRows(
        picker.rows,
        listing.sessions,
        listing.total,
        sessionRowBudget(stdout?.rows, picker.rows.length),
      )
      rows.splice(0, rows.length, ...built.map((row) => ({
        ...row,
        label: clipColumnsForMenu(row.label, 26),
        hint: clipColumnsForMenu(row.hint, 70),
      })))
    }
    if (name === 'agent') {
      const currentAgent = (globalThis as { __kiroControllerState?: () => { agent?: { activeAgent?: string } } })
        .__kiroControllerState?.()?.agent?.activeAgent ?? 'default'
      const agentSvc = (globalThis as { __kiroAgentList?: () => readonly { name: string; description: string }[] }).__kiroAgentList
      for (const preset of agentSvc?.() ?? []) {
        rows.splice(rows.length - 1, 0, {
          value: `swap ${preset.name}`,
          label: clipColumnsForMenu(preset.name, 12),
          hint: clipColumnsForMenu(preset.description !== '' ? preset.description : '无描述', 60),
        })
      }
      return {
        title: `切换 / 管理自定义 agent（当前：${currentAgent}）`,
        options: rows,
        apply: (value) => {
          setOptionMenu(undefined)
          if (prefill.has(value)) {
            insertIntoPrompt(prefillText('agent', value))
            return
          }
          onSubmit(`/agent ${value}`)
        },
      }
    }
    // Patch the session titles in once they resolve (they read each log).
    if (name === 'chat') {
      const titlesSvc = (globalThis as { __kiroChatTitles?: (ids: readonly string[]) => Promise<Map<string, string>> }).__kiroChatTitles
      const ids = rows
        .map((row) => /^resume (session-\S+)$/u.exec(row.value)?.[1])
        .filter((id): id is string => id !== undefined)
      if (titlesSvc !== undefined && ids.length > 0) {
        void titlesSvc(ids).then((titles) => {
          if (titles.size === 0) return
          setOptionMenu((current) => current === undefined
            ? current
            : { ...current, options: withSessionTitles(current.options, titles) })
        }).catch(() => {
          // titles are cosmetic; the id and timestamp still identify a session
        })
      }
    }
    return {
      title: picker.title,
      options: rows,
      apply: (value) => {
        setOptionMenu(undefined)
        if (prefill.has(value)) {
          insertIntoPrompt(prefillText(name, value))
          return
        }
        onSubmit(`/${name} ${value}`)
      },
    }
  }

  const contextApprox = state.agent.contextApprox === true

  const contextPct = (() => {
    const limit = state.agent.contextLimitTokens
    if (limit === undefined || limit <= 0) return undefined
    const pct = (state.agent.contextUsedTokens / limit) * 100
    // Under 10% show one decimal so the number is visibly alive on 1M-window
    // models; above that integers are enough resolution.
    return pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct)
  })()

  /**
   * The gutter text the prompt shows right now (`0% > ` / `约 12% > ` / `> `),
   * echoed into the transcript on an empty Enter — a shell prints its prompt
   * again. Kept in sync with Prompt's own gutter by the same rules.
   */
  const echoGutter = (() => {
    const pct = contextPct
    const prefix = pct === undefined
      ? ''
      : `${contextApprox === true ? STRINGS.prompt.approxPrefix : ''}${pct}% `
    return `${prefix}> `
  })()


  return (
    <Box flexDirection="column" height="100%">
      {splashSettled ? null : (
        <Box flexDirection="column">
          <Text>{liveSplash ?? splash}</Text>
        </Box>
      )}
      <Transcript
        messages={state.messages}
        header={splashSettled ? { kind: 'splash', key: 'splash', content: splash } : undefined}
      />
      <ProgressOverlay
        toolName={activeToolName}
        busy={state.agent.status === 'running'}
        subtext={state.hasActiveTool ? 'executing…' : undefined}
      />
      {shouldShowStatusBar({
        agent: state.agent,
        activeAgentName,
        prefix,
        bootIdentity: bootIdentity.current,
        awaitingDecision: state.approval !== undefined || state.question !== undefined,
      })
        ? <StatusBar agent={state.agent} prefix={prefix} activeAgentName={activeAgentName} />
        : null}
      {optionMenu !== undefined ? (
        <OptionMenu
          title={optionMenu.title}
          options={optionMenu.options}
          onPick={(value) => { optionMenu.apply(value) }}
          onCancel={() => { setOptionMenu(undefined) }}
        />
      ) : null}
      {state.question !== undefined ? (
        <PlanReviewOverlay
          request={state.question}
          onResolve={(choice) => controller.resolveQuestion(choice)}
        />
      ) : state.approval !== undefined ? (
        <ApprovalOverlay
          request={state.approval}
          diff={approvalDiff(state, state.approval.toolName)}
          approvalCommand={approvalCommandOf(state, state.approval.toolName)}
          onResolve={(choice) => controller.resolveApproval(choice)}
        />
      ) : state.picker !== undefined ? (
        <PickerOverlay
          picker={state.picker}
          onMoveTo={(index) => controller.setPickerSelection(index)}
          onSelect={() => controller.selectPickerItem()}
          onClose={() => controller.closePicker()}
        />
      ) : slashMenuOpen || optionMenu !== undefined ? (
        <SlashMenu
          initialQuery={prefix === '/' ? prefixQuery : ''}
          active={slashMenuOpen}
          onClose={() => setSlashMenuOpen(false)}
          onSelect={(text) => onSubmit(text)}
        />
      ) : (
        <Prompt
          tightTop={lastIsPromptEcho}
          busy={state.agent.status === 'running'}
          contextPct={contextPct}
          contextApprox={contextApprox}
          history={submitHistory}
          onEmptySubmit={() => controller.appendPromptEcho(echoGutter)}
          onSubmit={(text) => {
            // A submitted prompt starts a fresh two-stage exit count.
            disarmExit()
            // Option picker: a BARE enumerated command opens the picker
            // instead of running bare (which only printed usage text).
            const bare = text.trim().replace(/^\//u, '').toLowerCase()
            if (optionMenu === undefined && bare !== '' && !bare.includes(' ')) {
              const picker = optionMenuFor(bare)
              if (picker !== undefined) {
                setOptionMenu(picker)
                return
              }
            }
            if (text.trim() !== '') {
              setSubmitHistory((prev) => (prev[prev.length - 1] === text ? prev : [...prev, text]))
            }
            onSubmit(text)
            setPrefix(undefined)
            setPrefixQuery('')
            setAutocompleteSelected(0)
          }}
          onPrefix={(p, query) => {
            setPrefix(p)
            setPrefixQuery(query ?? '')
            setAutocompleteSelected(0)
          }}
          onAutocompleteMove={(delta) => {
            setAutocompleteSelected((idx) => Math.max(0, idx + delta))
          }}
          onAutocompleteCommit={() => {
            if (prefix === '@') {
              // Insert the picked mention into the draft instead of
              // submitting; the user keeps composing the message. Mirror
              // the popover's Fuse ordering so the highlighted row is what
              // gets inserted.
              const fuse = new Fuse([...atItems], {
                keys: ['label', 'hint', 'keywords'],
                threshold: 0.35,
                ignoreLocation: true,
                minMatchCharLength: 1,
              })
              const ranked = prefixQuery === '' ? [...atItems] : fuse.search(prefixQuery).map((r) => r.item)
              const picked = ranked.slice(autocompleteSelected, autocompleteSelected + 1)[0]
              if (picked !== undefined) {
                insertSeq.current += 1
                setAtInsert({ token: `@${prefixQuery}`, insert: picked.insert, seq: insertSeq.current })
              }
              setAutocompleteSelected(0)
              return
            }
            // Args already typed (`/chat resume`) — commit submits the full
            // draft; committing only the highlighted name would drop them.
            if (prefix === '/' && prefixQuery.includes(' ')) {
              const full = `/${prefixQuery.trim()}`
              // This Enter was consumed by the POPUP, not by the prompt's
              // submit path, so the prompt must be cleared here. Leaving it
              // meant the next command was appended to the old draft:
              // `/chat list` + `/chat` became `/chat list/chat`.
              insertSeq.current += 1
              setAtInsert({ token: '', insert: '', seq: insertSeq.current, clearAll: true })
              onSubmit(full)
            } else {
              // '/' picker: submit the HIGHLIGHTED command (arrow keys move
              // autocompleteSelected via onAutocompleteMove).
              const items = slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description })))
              // Same ranker the popup used: Enter runs the highlighted row.
              const filtered = rankCandidates(items, prefixQuery)
              const pick = filtered[autocompleteSelected] ?? filtered[0]
              if (pick !== undefined) {
                // insert is the BARE name; commands submit with the '/' prefix.
                // Popup commits bypass the wrapper below, so re-run the
                // option-picker interception here.
                const committed = `/${pick.insert}`
                const bareName = pick.insert.toLowerCase()
                if (!bareName.includes(' ')) {
                  const viaPopup = optionMenuFor(bareName)
                  if (viaPopup !== undefined) {
                    setOptionMenu(viaPopup)
                    insertSeq.current += 1
                    setAtInsert({ token: '', insert: '', seq: insertSeq.current, clearAll: true })
                    return
                  }
                }
                onSubmit(committed)
                // The popup owned the Enter key (not the prompt's submit path),
                // so clear the draft through the insert channel.
                insertSeq.current += 1
                setAtInsert({ token: '', insert: '', seq: insertSeq.current, clearAll: true })
              }
            }
            setPrefix(undefined)
            setPrefixQuery('')
          }}
          pendingInsert={atInsert}
          autocompleteActive={
            !slashMenuOpen
            && (
              (prefix === '/')
              || (prefix === '@' && !prefixQuery.includes(' ') && atItems.length > 0)
            )
          }
          popupOpen={prefix !== undefined && !slashMenuOpen}
        />
      )}
      {prefix === '/' && !slashMenuOpen && optionMenu === undefined ? (
        <Autocomplete
          trigger="/"
          query={slashQuery}
          candidates={slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description })))}
          selected={autocompleteSelected}
        />
      ) : prefix === '@' && !slashMenuOpen && !prefixQuery.includes(' ') ? (
        <Autocomplete
          trigger="@"
          query={prefixQuery}
          candidates={atItems}
          selected={0}
        />
      ) : null}
      {state.overlay.kind !== 'none' ? (
        <Box borderStyle="round" borderColor={palette.enabled ? 'green' : undefined} paddingX={1} marginTop={1}>
          <Text>{palette.accent(`overlay: ${state.overlay.kind}`)}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
