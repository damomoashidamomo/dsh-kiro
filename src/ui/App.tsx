/**
 * App — the Ink root component. Lays out the Transcript, optional Splash,
 * StatusBar, and Prompt, and dispatches key actions to the runtime.
 *
 * The component is dumb on purpose: all state lives on the
 * SessionController, and React only re-renders when the controller publishes.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/App
 */

import { Box, Text, useApp, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import { Transcript } from './Transcript'
import { Prompt } from './Prompt'
import { StatusBar } from './StatusBar'
import { banner, palette } from '../theme/palette'
import { BANNER } from '../theme/banner'
import type { SessionController } from '../runtime/session-controller'
import type { SessionRenderState } from '../runtime/types'
import { mapKey } from '../runtime/keybindings'

export interface AppProps {
  controller: SessionController
  /** Seed text passed via the CLI positional — submitted as the first turn. */
  seedTask?: string | undefined
  /** Active agent name (e.g. from `--agent`). */
  activeAgentName?: string | undefined
  /** Submit handler wired by the runtime. */
  onSubmit: (text: string) => void
}

/** Render the TUI. */
export function App({ controller, seedTask, activeAgentName, onSubmit }: AppProps): JSX.Element {
  const { exit } = useApp()
  const [state, setState] = useState<SessionRenderState>(() => controller.getState())
  const [prefix, setPrefix] = useState<'/' | '@' | '!' | undefined>(undefined)
  const [seeded, setSeeded] = useState<boolean>(seedTask === undefined)

  useEffect(() => controller.subscribe(setState), [controller])

  useEffect(() => {
    if (seeded) return
    if (seedTask !== undefined && seedTask !== '') {
      onSubmit(seedTask)
    }
    setSeeded(true)
  }, [seeded, seedTask, onSubmit])

  // Top-level keybindings dispatch on top of the Prompt's own useInput.
  // Ink routes key events to all `useInput` subscribers in registration order,
  // so we set this one first and let the Prompt handle its own characters.
  useInput((input, key) => {
    if (state.overlay.kind !== 'none') return
    const action = mapKey({ input, key })
    if (action === 'quit') {
      exit()
    } else if (action === 'interrupt') {
      controller.patchAgent({ status: 'cancelling' })
    } else if (action === 'clear-screen') {
      process.stdout.write('\x1b[2J\x1b[H')
    }
  }, { isActive: true })

  const splash = useMemo(() => banner(BANNER), [])

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text>{splash}</Text>
      </Box>
      <Transcript messages={state.messages} />
      <StatusBar agent={state.agent} prefix={prefix} activeAgentName={activeAgentName} />
      <Prompt
        busy={state.agent.status === 'running'}
        onSubmit={(text) => {
          onSubmit(text)
          setPrefix(undefined)
        }}
        onPrefix={setPrefix}
      />
      {state.overlay.kind !== 'none' ? (
        <Box borderStyle="round" borderColor={palette.enabled ? 'green' : undefined} paddingX={1} marginTop={1}>
          <Text>{palette.accent(`overlay: ${state.overlay.kind}`)}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
