import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { PickerOverlay } from '../src/ui/PickerOverlay'
import type { PickerState } from '../src/runtime/types'

const picker: PickerState = {
  title: '选择模型',
  selected: 1, // MiniMax-M2.7 (current)
  items: [
    { value: 'minimax/MiniMax-M3', label: 'MiniMax · MiniMax-M3', hint: 'minimax/MiniMax-M3' },
    { value: 'minimax/MiniMax-M2.7', label: 'MiniMax · MiniMax-M2.7', hint: 'minimax/MiniMax-M2.7', current: true },
    { value: 'scnet/DeepSeek-V4-Flash', label: 'scnet · DeepSeek-V4-Flash', hint: 'scnet/DeepSeek-V4-Flash' },
    { value: 'scnet/Kimi-K3', label: 'scnet · Kimi-K3', hint: 'scnet/Kimi-K3' },
  ],
}

function setup() {
  const onMoveTo = vi.fn()
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const instance = render(
    <PickerOverlay picker={picker} onMoveTo={onMoveTo} onSelect={onSelect} onClose={onClose} />,
  )
  return { instance, onMoveTo, onSelect, onClose }
}

async function settled(instance: ReturnType<typeof render>): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 40))
  return instance.lastFrame() ?? ''
}

describe('PickerOverlay keyboard interaction', () => {
  it('renders title, current marker, and all rows', async () => {
    const { instance, onSelect, onClose } = setup()
    const frame = await settled(instance)
    expect(frame).toContain('选择模型')
    expect(frame).toContain('MiniMax · MiniMax-M2.7 ✓')
    expect(frame).toContain('scnet · Kimi-K3')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    instance.unmount()
  })

  it('filters rows as the user types and restores on clear', async () => {
    const { instance, onMoveTo } = setup()
    await settled(instance)
    instance.stdin.write('kimi')
    let frame = await settled(instance)
    expect(frame).toContain('scnet · Kimi-K3')
    expect(frame).not.toContain('scnet · DeepSeek-V4-Flash')
    expect(frame).not.toContain('MiniMax · MiniMax-M3')
    // The only filtered row becomes the highlight.
    expect(onMoveTo).toHaveBeenCalledWith(3)

    onMoveTo.mockClear()
    // Backspace as a multi-byte chunk (PTY batching) must clear the query.
    instance.stdin.write('\x7f\x7f\x7f\x7f')
    frame = await settled(instance)
    expect(frame).toContain('scnet · DeepSeek-V4-Flash')
    expect(frame).toContain('MiniMax · MiniMax-M3')
    expect(frame).not.toContain('filter:')
    instance.unmount()
  })

  it('shows an empty-state hint when the filter matches nothing', async () => {
    const { instance } = setup()
    await settled(instance)
    instance.stdin.write('zzz')
    const frame = await settled(instance)
    expect(frame).toContain('no matches')
    instance.unmount()
  })

  it('moves the highlight with arrows and confirms with Enter', async () => {
    const { instance, onMoveTo, onSelect } = setup()
    await settled(instance)
    instance.stdin.write('\x1b[B')
    await settled(instance)
    expect(onMoveTo).toHaveBeenCalledWith(2) // from index 1 → 2
    instance.stdin.write('\r')
    await settled(instance)
    expect(onSelect).toHaveBeenCalledTimes(1)
    instance.unmount()
  })

  it('closes on Esc and Ctrl+C', async () => {
    const { instance, onClose } = setup()
    await settled(instance)
    instance.stdin.write('\x1b')
    await settled(instance)
    expect(onClose).toHaveBeenCalledTimes(1)
    instance.unmount()
  })

  it('Esc first clears a filter, then closes', async () => {
    const { instance, onClose } = setup()
    await settled(instance)
    instance.stdin.write('kimi')
    await settled(instance)
    instance.stdin.write('\x1b')
    let frame = await settled(instance)
    expect(frame).toContain('MiniMax · MiniMax-M3') // filter cleared
    expect(onClose).not.toHaveBeenCalled()
    instance.stdin.write('\x1b')
    await settled(instance)
    expect(onClose).toHaveBeenCalledTimes(1)
    instance.unmount()
  })
})
