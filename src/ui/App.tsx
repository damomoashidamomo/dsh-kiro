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
import { OptionMenu, type OptionItem } from './OptionMenu'
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
  const [optionMenu, setOptionMenu] = useState<
    | { title: string; options: readonly OptionItem[]; apply: (value: string) => void }
    | undefined
  >(undefined)
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

  // Build the option picker for a bare enumerated command.
  const optionMenuFor = (name: string): { title: string; options: readonly OptionItem[]; apply: (value: string) => void } | undefined => {
    switch (name) {
      case 'engine':
        return {
          title: `选择引擎组合（当前：loop=${controller.getState().agent.loopDriver ?? 'dsh'} · tools=${controller.getState().agent.toolEngine ?? 'dsh'}）`,
          options: [
            { value: 'kiro', label: 'kiro', hint: '自研循环 + Rust 工具引擎（Landlock）· 状态栏 [kiro/rust]' },
            { value: 'kiro -p', label: 'kiro -p', hint: '自研循环 + 平台工具管线' },
            { value: 'dsh', label: 'dsh', hint: 'DSH 平台全套（默认）' },
          ],
          apply: (value: string) => { setOptionMenu(undefined); onSubmit(`/engine ${value}`) },
        }
      case 'loop':
        return {
          title: `选择回合驱动器（当前：${controller.getState().agent.loopDriver ?? 'dsh'}）`,
          options: [
            { value: 'dsh', label: 'dsh', hint: 'DSH 平台 agent loop（完整工具链）' },
            { value: 'kiro', label: 'kiro', hint: 'dsh-kiro 自研驱动（完整工具循环）' },
          ],
          apply: (value: string) => { setOptionMenu(undefined); onSubmit(`/loop ${value}`) },
        }
      case 'tools':
        return {
          title: `选择工具引擎（当前：${controller.getState().agent.toolEngine ?? 'dsh'}；仅 /loop kiro 生效）`,
          options: [
            { value: 'dsh', label: 'dsh', hint: '平台工具管线（平台沙箱 + 审批）' },
            { value: 'rust', label: 'rust', hint: 'Rust 引擎（Landlock 内核级沙箱，每调用新进程）' },
          ],
          apply: (value: string) => { setOptionMenu(undefined); onSubmit(`/tools ${value}`) },
        }
      case 'agent': {
        // Title shows the CURRENT agent so the user knows where they are.
        const controllerSvc = (globalThis as { __kiroControllerState?: () => { agent?: { activeAgent?: string } } }).__kiroControllerState?.()
        const currentAgent = controllerSvc?.agent?.activeAgent ?? 'default'
        // Dynamic options: discovered presets; 'list' for the static entry.
        const agentSvc = (globalThis as { __kiroAgentList?: () => readonly { name: string; description: string }[] }).__kiroAgentList
        const presets = agentSvc?.() ?? []
        const options: OptionItem[] = [
          { value: 'list', label: 'list', hint: '列出全部自定义 agent' },
          ...presets.map((preset) => ({
            value: `swap ${preset.name}`,
            label: clipColumnsForMenu(preset.name, 12),
            hint: clipColumnsForMenu(preset.description !== '' ? preset.description : '无描述', 60),
          })),
        ]
        return {
          title: `切换 / 管理自定义 agent（当前：${currentAgent}）`,
          options,
          apply: (value: string) => { setOptionMenu(undefined); onSubmit(`/agent ${value}`) },
        }
      }
      case 'chat': {
        const chatSvc = (globalThis as { __kiroChatList?: () => readonly { id: string; title: string }[] }).__kiroChatList
        const sessions = (chatSvc?.() ?? []).slice(0, 4)
        const options: OptionItem[] = [
          { value: 'list', label: 'list', hint: '列出会话（含时间与简介）' },
          ...sessions.map((session) => ({
            value: `resume ${session.id}`,
            label: clipColumnsForMenu(session.id.slice(8, 20), 14),
            hint: clipColumnsForMenu(session.title !== '' ? session.title : '（无简介）', 60),
          })),
          { value: 'new', label: 'new', hint: '存盘当前会话并开启新会话' },
        ]
        return {
          title: '会话管理（列出 / 恢复 / 新开）',
          options,
          apply: (value: string) => { setOptionMenu(undefined); onSubmit(`/chat ${value}`) },
        }
      }
      case 'spec':
        return {
          title: 'Spec 流程（先确认后开发）',
          options: [
            { value: 'start', label: 'start', hint: '开始新 spec（起草 requirements.md）' },
            { value: 'approve', label: 'approve', hint: '确认当前阶段，进入下一阶段' },
            { value: 'show', label: 'show', hint: '查看当前阶段与文件' },
            { value: 'revise', label: 'revise', hint: '打回当前阶段并附修改意见' },
            { value: 'abort', label: 'abort', hint: '放弃当前 spec' },
          ],
          apply: (value: string) => {
            setOptionMenu(undefined)
            onSubmit(value === 'start' ? '/spec start 新功能' : `/spec ${value}`)
          },
        }
      default:
        return undefined
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
          busy={state.agent.status === 'running'}
          contextPct={contextPct}
          contextApprox={contextApprox}
          history={submitHistory}
          onEmptySubmit={() => controller.appendBlankLine()}
          onSubmit={(text) => {
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
