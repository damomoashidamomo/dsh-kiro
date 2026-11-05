import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { SessionController } from '../src/runtime/session-controller'
import { Transcript } from '../src/ui/Transcript'
import { Prompt } from '../src/ui/Prompt'

/**
 * Shell-like prompt echo: Enter on an empty prompt prints the prompt gutter
 * (`0% > `) into the transcript, pushing the conversation up one row per
 * press — a shell prints a fresh prompt line.
 *
 * Each press is its own message: Ink's `<Static>` prints an item once and
 * never repaints it, so a shared id would make every press after the first
 * invisible. The row is NOT all whitespace either — Ink trims trailing blanks
 * per line, which would erase the row entirely.
 */
function echo(id: string, text: string) {
  return {
    id,
    kind: 'echo' as const,
    text,
    tool: undefined,
    createdAt: Date.now(),
    seq: 0,
    usage: undefined,
    streaming: false,
  }
}

describe('prompt echo from an empty Enter', () => {
  it('appends one message per press, carrying the gutter text', () => {
    const ctrl = new SessionController()
    const seen: string[] = []
    ctrl.subscribe((state) => {
      const last = state.messages.at(-1)
      if (last?.kind === 'echo') seen.push(`${last.id}:${last.text}`)
    })
    ctrl.appendPromptEcho('0% > ')
    ctrl.appendPromptEcho('0% > ')
    const echoes = ctrl.state.messages.filter((m) => m.kind === 'echo')
    expect(echoes).toHaveLength(2)
    expect(echoes[0]?.text).toBe('0% > ')
    // Distinct ids, in order — otherwise `<Static>` swallows the repeats.
    expect(new Set(seen).size).toBe(2)
  })

  it('renders the gutter text as a dim row between messages', async () => {
    const system = (id: string, text: string) => ({
      id,
      kind: 'system' as const,
      text,
      tool: undefined,
      createdAt: Date.now(),
      seq: 0,
      usage: undefined,
      streaming: false,
    })
    const r = render(
      <Transcript messages={[system('s1', 'AAA'), echo('echo-1', '0% > '), system('s2', 'BBB')] as never} />,
    )
    await new Promise((res) => setTimeout(res, 45))
    const frame = r.lastFrame() ?? ''
    r.unmount()
    // One row, the prompt gutter, between the two message lines. Ink trims
    // the trailing space of the gutter text, so match the visible part.
    expect(frame).toMatch(/AAA\n0% >\n/u)
  })

  it('falls back to an untrimmable row when the gutter is empty', async () => {
    const r = render(<Transcript messages={[echo('echo-1', '')] as never} />)
    await new Promise((res) => setTimeout(res, 45))
    const frame = r.lastFrame() ?? ''
    r.unmount()
    // A zero-width space survives Ink's per-line trimEnd; a space would not.
    expect(frame).toContain('\u200b')
  })

  it('Prompt turns an empty Enter into onEmptySubmit, never into a submit', async () => {
    let submit = 0
    let empty = 0
    const { stdin, unmount } = render(
      <Prompt busy={false} onSubmit={() => { submit += 1 }} onEmptySubmit={() => { empty += 1 }} />,
    )
    await new Promise((r) => setTimeout(r, 30))
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 40))
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 40))
    expect(empty).toBe(2)
    expect(submit).toBe(0)
    unmount()
  })

  it('a non-empty Enter still submits exactly once', async () => {
    let submit = 0
    let empty = 0
    const { stdin, unmount } = render(
      <Prompt busy={false} onSubmit={() => { submit += 1 }} onEmptySubmit={() => { empty += 1 }} />,
    )
    await new Promise((r) => setTimeout(r, 30))
    stdin.write('hi\r')
    await new Promise((r) => setTimeout(r, 50))
    expect(submit).toBe(1)
    expect(empty).toBe(0)
    unmount()
  })
})
