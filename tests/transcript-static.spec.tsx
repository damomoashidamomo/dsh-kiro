import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Transcript } from '../src/ui/Transcript'
import type { Message } from '../src/runtime/types'

function toolMsg(id: string, callId: string, streaming: boolean, state: 'running' | 'done'): Message {
  return {
    id, kind: 'tool-call', text: '',
    tool: { id, callId, name: 'read', argsPreview: `{"file_path":"${callId}.txt"}`, state, output: `out-${callId}`, outputSpillPath: undefined, durationMs: 5, metadata: {} },
    createdAt: Date.now(), seq: 1, usage: undefined, streaming,
  }
}

const header = { kind: 'splash' as const, key: 'splash', content: 'BANNER' }

async function settle(ms = 40): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('Transcript parallel-call static migration', () => {
  it('prints BOTH tool cards when each finishes in sequence', async () => {
    const { lastFrame, rerender, unmount } = render(
      <Transcript messages={[toolMsg('t1', 'a', true, 'running'), toolMsg('t2', 'b', true, 'running')]} header={header} />,
    )
    await settle()
    // First result lands: t1 done, t2 still running.
    rerender(
      <Transcript messages={[toolMsg('t1', 'a', false, 'done'), toolMsg('t2', 'b', true, 'running')]} header={header} />,
    )
    await settle()
    // Second result lands: both done.
    rerender(
      <Transcript messages={[toolMsg('t1', 'a', false, 'done'), toolMsg('t2', 'b', false, 'done')]} header={header} />,
    )
    await settle()
    const frame = lastFrame() ?? ''
    console.log('--- final frame ---')
    console.log(frame)
    const dones = (frame.match(/✓ read · done/g) ?? []).length
    expect(dones).toBe(2)
    unmount()
  })
})
