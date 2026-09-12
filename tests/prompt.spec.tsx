import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Prompt } from '../src/ui/Prompt'

async function frameOf(tree: Parameters<typeof render>[0]): Promise<string> {
  const { lastFrame, unmount } = render(tree)
  // Wait for Ink's first render pass to land in the stdout buffer.
  await new Promise((resolve) => setTimeout(resolve, 30))
  const frame = lastFrame() ?? ''
  unmount()
  return frame
}

describe('Prompt context percentage', () => {
  it('renders the percent left of the > gutter', async () => {
    const frame = await frameOf(<Prompt busy={false} contextPct={42} onSubmit={() => {}} />)
    expect(frame).toContain('42%')
    expect(frame).toContain('>')
    // The percent must sit before the gutter symbol.
    const idxPct = frame.indexOf('42%')
    const idxGutter = frame.indexOf('>')
    expect(idxPct).toBeGreaterThanOrEqual(0)
    expect(idxGutter).toBeGreaterThan(idxPct)
  })

  it('renders 0% cleanly at the start of a session', async () => {
    const frame = await frameOf(<Prompt busy={false} contextPct={0} onSubmit={() => {}} />)
    expect(frame).toContain('0%')
  })

  it('omits the percent when the context limit is unknown', async () => {
    const frame = await frameOf(<Prompt busy={false} onSubmit={() => {}} />)
    expect(frame).not.toContain('%')
    expect(frame).toContain('>')
  })
})

describe('Prompt multi-byte chunk handling', () => {
  it('submits when \r arrives inside a batched chunk ("/model\\r")', async () => {
    const onSubmit = vi.fn()
    const { stdin, unmount } = render(<Prompt busy={false} onSubmit={onSubmit} />)
    await new Promise((resolve) => setTimeout(resolve, 30))
    stdin.write('/model\r')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toBe('/model')
    unmount()
  })

  it('inserts plain multi-char text without mangling', async () => {
    const onSubmit = vi.fn()
    const { stdin, lastFrame, unmount } = render(<Prompt busy={false} onSubmit={onSubmit} />)
    await new Promise((resolve) => setTimeout(resolve, 30))
    stdin.write('hello world')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((lastFrame() ?? '').replace(/\x1b\[[0-9;]*m/g, '')).toContain('hello world')
    expect(onSubmit).not.toHaveBeenCalled()
    unmount()
  })
})
