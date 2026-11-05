import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { SessionController } from '../src/runtime/session-controller'
import { Transcript } from '../src/ui/Transcript'
import { Prompt } from '../src/ui/Prompt'

/**
 * Shell-like blank lines: Enter on an empty prompt must print a line and push
 * the transcript up (a shell prints a fresh prompt line). Each press is its
 * own message — `<Static>` prints an item once and never repaints it, so a
 * shared id would make every press after the first invisible.
 */
function blank(id: string) {
  return {
    id,
    kind: 'blank' as const,
    text: '',
    tool: undefined,
    createdAt: Date.now(),
    seq: 0,
    usage: undefined,
    streaming: false,
  }
}

describe('blank lines from an empty Enter', () => {
  it('appends one message per press, with unique ids', () => {
    const ctrl = new SessionController()
    const seen: string[] = []
    ctrl.subscribe((state) => {
      const last = state.messages.at(-1)
      if (last?.kind === 'blank') seen.push(last.id)
    })
    ctrl.appendBlankLine()
    ctrl.appendBlankLine()
    ctrl.appendBlankLine()
    expect(ctrl.state.messages.filter((m) => m.kind === 'blank')).toHaveLength(3)
    expect(new Set(seen).size).toBe(3)
    // Nothing else is disturbed.
    expect(ctrl.state.messages.every((m) => m.kind === 'blank')).toBe(true)
  })

  it('renders one printable row per blank (and the row is invisible)', async () => {
    // A shell pushes the prompt down one row per Enter. `BlankLine` carries a
    // zero-width space so Ink cannot trim the row away, so assert on the row
    // itself rather than on a space: an empty row between the two lines.
    const frameOf = async (msgs: unknown[]): Promise<string> => {
      const r = render(<Transcript messages={msgs as never} />)
      await new Promise((res) => setTimeout(res, 45))
      const frame = r.lastFrame() ?? ''
      r.unmount()
      return frame
    }
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
    const plain = await frameOf([system('s1', 'AAA'), system('s2', 'BBB')])
    const oneBlank = await frameOf([system('s1', 'AAA'), blank('blank-1'), system('s2', 'BBB')])
    const twoBlanks = await frameOf([
      system('s1', 'AAA'),
      blank('blank-1'),
      blank('blank-2'),
      system('s2', 'BBB'),
    ])

    // One extra row, drawn with nothing visible (zero-width space only) —
    // no space character, which Ink would trim away.
    const cost = oneBlank.length - plain.length
    expect(cost).toBeGreaterThan(0)
    expect(plain).not.toContain('\u200b')
    expect(oneBlank).toContain('\u200b')
    // Every further press costs exactly the same one row.
    expect(twoBlanks.length - oneBlank.length).toBe(cost)
  })

  it('Prompt turns an empty Enter into onEmptySubmit, never into a submit', async () => {
    const onSubmit = vi.fn()
    const onEmptySubmit = vi.fn()
    const { stdin, unmount } = render(
      <Prompt busy={false} onSubmit={onSubmit} onEmptySubmit={onEmptySubmit} />,
    )
    await new Promise((r) => setTimeout(r, 30))
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 40))
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 40))
    expect(onEmptySubmit).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
    unmount()
  })

  it('a non-empty Enter still submits exactly once', async () => {
    const onSubmit = vi.fn()
    const onEmptySubmit = vi.fn()
    const { stdin, unmount } = render(
      <Prompt busy={false} onSubmit={onSubmit} onEmptySubmit={onEmptySubmit} />,
    )
    await new Promise((r) => setTimeout(r, 30))
    stdin.write('hi\r')
    await new Promise((r) => setTimeout(r, 50))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onEmptySubmit).not.toHaveBeenCalled()
    unmount()
  })
})
