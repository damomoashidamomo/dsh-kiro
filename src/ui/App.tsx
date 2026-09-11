/**
 * App — the Ink root component. Lays out the Transcript, Splash, StatusBar,
 * Prompt, and the optional ProgressOverlay / SlashMenu.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */

import { Box, Text, useApp, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import { Transcript } from './Transcript'
import { Prompt } from './Prompt'
import { StatusBar } from './StatusBar'
import { ProgressOverlay } from './ProgressOverlay'
import { SlashMenu } from './SlashMenu'
import { Autocomplete, slashCandidates } from './Autocomplete'
import { banner, palette } from '../theme/palette'
import { BANNER } from '../theme/banner'
import type { SessionController } from '../runtime/session-controller'
import type { SessionRenderState } from '../runtime/types'
import { mapKey } from '../runtime/keybindings'
import { ALL_COMMANDS } from '../commands/registry'

export interface AppProps {
  controller: SessionController
  seedTask?: string | undefined
  activeAgentName?: string | undefined
  onSubmit: (text: string) => void
}

/** Render the TUI. */
export function App({ controller, seedTask, activeAgentName, onSubmit }: AppProps): JSX.Element {
  const { exit } = useApp()
  const [state, setState] = useState<SessionRenderState>(() => controller.getState())
  const [prefix, setPrefix] = useState<'/' | '@' | '!' | undefined>(undefined)
  const [seeded, setSeeded] = useState<boolean>(seedTask === undefined)
  const [slashMenuOpen, setSlashMenuOpen] = useState<boolean>(false)
  const [prefixQuery, setPrefixQuery] = useState<string>('')
  const [autocompleteSelected, setAutocompleteSelected] = useState<number>(0)

  useEffect(() => controller.subscribe(setState), [controller])

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
    if (state.overlay.kind !== 'none') return
    const action = mapKey({ input, key })
    if (action === 'quit') {
      exit()
    } else if (action === 'interrupt') {
      controller.patchAgent({ status: 'cancelling' })
    } else if (action === 'clear-screen') {
      process.stdout.write('\x1b[2J\x1b[H')
    } else if (action === 'open-slash-menu') {
      setSlashMenuOpen(true)
    }
  }, { isActive: true })

  const splash = useMemo(() => banner(BANNER), [])
  const activeToolName = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const msg = state.messages[i]
      if (msg?.kind === 'tool-call' && msg.streaming && msg.tool !== undefined) {
        return msg.tool.name
      }
    }
    return undefined
  }, [state.messages])

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text>{splash}</Text>
      </Box>
      <Transcript messages={state.messages} />
      <ProgressOverlay
        toolName={activeToolName}
        busy={state.agent.status === 'running'}
        subtext={state.hasActiveTool ? 'executing…' : undefined}
      />
      <StatusBar agent={state.agent} prefix={prefix} activeAgentName={activeAgentName} />
      {slashMenuOpen ? (
        <SlashMenu
          initialQuery={prefix === '/' ? prefixQuery : ''}
          active={slashMenuOpen}
          onClose={() => setSlashMenuOpen(false)}
          onSelect={(text) => onSubmit(text)}
        />
      ) : (
        <Prompt
          busy={state.agent.status === 'running'}
          onSubmit={(text) => {
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
            const items = slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description })))
            const filtered = items.filter((it) => prefix === '/' || prefix === '@')
            const visible = filtered.slice(autocompleteSelected, autocompleteSelected + 1)
            if (visible[0] !== undefined) {
              onSubmit(visible[0].insert)
            }
            setPrefix(undefined)
            setPrefixQuery('')
          }}
        />
      )}
      {prefix === '/' && !slashMenuOpen ? (
        <Autocomplete
          trigger="/"
          query={prefixQuery}
          candidates={slashCandidates(ALL_COMMANDS.map((c) => ({ name: c.name, description: c.description })))}
          selected={autocompleteSelected}
        />
      ) : prefix === '@' && !slashMenuOpen ? (
        <Autocomplete
          trigger="@"
          query={prefixQuery}
          candidates={[]}
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
