/**
 * App — the Ink root component. Lays out the Transcript, Splash, StatusBar,
 * Prompt, and the optional ProgressOverlay / SlashMenu.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */

import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Transcript } from './Transcript'
import { Prompt } from './Prompt'
import { StatusBar } from './StatusBar'
import { ProgressOverlay } from './ProgressOverlay'
import { SlashMenu } from './SlashMenu'
import { PickerOverlay } from './PickerOverlay'
import { ApprovalOverlay } from './ApprovalOverlay'
import { PlanReviewOverlay } from './PlanReviewOverlay'
import { Autocomplete, slashCandidates, type AutocompleteItem } from './Autocomplete'
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

/** Fuzzy-filter command candidates with the same Fuse config the popup uses. */
function fuseSearch<T extends { label: string; hint?: string }>(items: readonly T[], query: string): T[] {
  const q = query.toLowerCase()
  const scored = items
    .map((item) => ({ item, score: item.label.toLowerCase().includes(q) ? 0 : (item.hint ?? '').toLowerCase().includes(q) ? 1 : 2 }))
    .filter((row) => row.score < 2)
  scored.sort((a, b) => a.score - b.score)
  return scored.map((row) => row.item)
}

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
  const [prefixQuery, setPrefixQuery] = useState<string>('')
  const [autocompleteSelected, setAutocompleteSelected] = useState<number>(0)
  /** Submitted drafts, ↑/↓ recall (oldest first). */
  const [submitHistory, setSubmitHistory] = useState<readonly string[]>([])
  const [atItems, setAtItems] = useState<readonly AutocompleteItem[]>([])
  const [atInsert, setAtInsert] = useState<{ token: string; insert: string; seq: number; clearAll?: boolean } | undefined>(undefined)
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

  // kiro-style two-stage Ctrl+C: first press cancels the running turn, a
  // second press while still cancelling exits the TUI back to the shell.
  const interruptArmed = useRef<boolean>(false)

  useEffect(() => controller.subscribe(setState), [controller])

  // Returning to idle disarms the two-stage exit (the cancel completed).
  useEffect(() => {
    if (state.agent.status === 'idle') {
      interruptArmed.current = false
    }
  }, [state.agent.status])

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
    if (action === 'quit') {
      exit()
    } else if (action === 'interrupt') {
      const status = state.agent.status
      if (status === 'running' || status === 'cancelling') {
        if (interruptArmed.current) {
          // Second Ctrl+C while the turn is still being cancelled → exit.
          exit()
        } else {
          interruptArmed.current = true
          controller.patchAgent({ status: 'cancelling' })
          // Actually abort the in-flight request via the platform.
          cancelTurn()
        }
      } else {
        // Idle: kiro exits on a single Ctrl+C (kiro.dev issue #6442).
        exit()
      }
    } else if (state.approval !== undefined || state.question !== undefined) {
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

  const contextApprox = state.agent.contextApprox === true

  const contextPct = (() => {
    const limit = state.agent.contextLimitTokens
    if (limit === undefined || limit <= 0) return undefined
    const pct = (state.agent.contextUsedTokens / limit) * 100
    // Under 10% show one decimal so the number is visibly alive on 1M-window
    // models; above that integers are enough resolution.
    return pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct)
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
      <StatusBar agent={state.agent} prefix={prefix} activeAgentName={activeAgentName} />
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
      ) : slashMenuOpen ? (
        <SlashMenu
          initialQuery={prefix === '/' ? prefixQuery : ''}
          active={slashMenuOpen}
          onClose={() => setSlashMenuOpen(false)}
          onSelect={(text) => onSubmit(text)}
        />
      ) : (
        <Prompt
          busy={state.agent.status === 'running'}
          contextPct={contextPct}
          contextApprox={contextApprox}
          history={submitHistory}
          onSubmit={(text) => {
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
              onSubmit(`/${prefixQuery.trim()}`)
            } else {
              // '/' picker: submit the HIGHLIGHTED command (arrow keys move
              // autocompleteSelected via onAutocompleteMove).
              const items = slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description })))
              const filtered = prefixQuery === ''
                ? items
                : fuseSearch(items, prefixQuery)
              const pick = filtered[autocompleteSelected] ?? filtered[0]
              if (pick !== undefined) {
                // insert is the BARE name; commands submit with the '/' prefix.
                onSubmit(`/${pick.insert}`)
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
      {prefix === '/' && !slashMenuOpen ? (
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
