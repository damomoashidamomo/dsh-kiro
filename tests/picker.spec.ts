import { describe, it, expect, vi } from 'vitest'
import { SessionController } from '../src/runtime/session-controller'
import { modelCommand, buildModelItems } from '../src/commands/model'
import type { PickerItem } from '../src/runtime/types'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'

describe('SessionController interactive picker', () => {
  it('opens with the current item highlighted and clears on close', () => {
    const ctrl = new SessionController()
    const items: PickerItem[] = [
      { value: 'a/one', label: 'A · one' },
      { value: 'b/two', label: 'B · two', current: true },
      { value: 'c/three', label: 'C · three' },
    ]
    ctrl.openPicker({ title: 'pick', items, onSelect: () => {} })

    const state = ctrl.getState()
    expect(state.picker?.title).toBe('pick')
    expect(state.picker?.items).toHaveLength(3)
    expect(state.picker?.selected).toBe(1) // current item

    ctrl.closePicker()
    expect(ctrl.getState().picker).toBeUndefined()
  })

  it('refuses an empty item list', () => {
    const ctrl = new SessionController()
    ctrl.openPicker({ title: 'x', items: [], onSelect: () => {} })
    expect(ctrl.getState().picker).toBeUndefined()
  })

  it('moves selection with clamps', () => {
    const ctrl = new SessionController()
    const items: PickerItem[] = [
      { value: '1', label: 'one' },
      { value: '2', label: 'two' },
      { value: '3', label: 'three' },
    ]
    ctrl.openPicker({ title: 't', items, onSelect: () => {} })

    ctrl.movePickerSelection(1)
    expect(ctrl.getState().picker?.selected).toBe(1)
    ctrl.movePickerSelection(1)
    expect(ctrl.getState().picker?.selected).toBe(2)
    ctrl.movePickerSelection(1)
    expect(ctrl.getState().picker?.selected).toBe(2) // clamped at bottom
    ctrl.setPickerSelection(-5)
    expect(ctrl.getState().picker?.selected).toBe(0) // clamped at top
  })

  it('invokes the opener callback with the selected item, then closes', () => {
    const ctrl = new SessionController()
    const onSelect = vi.fn()
    const items: PickerItem[] = [
      { value: 'a/one', label: 'A · one' },
      { value: 'b/two', label: 'B · two' },
    ]
    ctrl.openPicker({ title: 't', items, onSelect })
    ctrl.setPickerSelection(1)
    ctrl.selectPickerItem()

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(items[1])
    expect(ctrl.getState().picker).toBeUndefined()
  })

  it('does not fire the callback after closePicker', () => {
    const ctrl = new SessionController()
    const onSelect = vi.fn()
    ctrl.openPicker({ title: 't', items: [{ value: '1', label: 'one' }], onSelect })
    ctrl.closePicker()
    ctrl.selectPickerItem()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('buildModelItems', () => {
  const piAi = {
    providers: {
      minimax: {
        displayName: 'MiniMax',
        models: [
          { id: 'MiniMax-M3', name: 'MiniMax-M3', contextWindow: 200_000 },
          { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7' },
        ],
      },
      scnet: {
        displayName: 'scnet',
        models: [
          { id: 'DeepSeek-V4-Flash', name: 'DeepSeek-V4-Flash' },
          { id: 'MiniMax-M3', name: 'MiniMax-M3' }, // duplicate across providers kept
        ],
      },
    },
  }

  it('flattens provider × model rows with hint and current marker', () => {
    const items = buildModelItems(piAi, { provider: 'minimax', model: 'MiniMax-M3' })
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({
      value: 'minimax/MiniMax-M3',
      label: 'MiniMax · MiniMax-M3',
      hint: 'minimax/MiniMax-M3',
      current: true,
    })
    expect(items.filter((i) => i.current)).toHaveLength(1)
  })

  it('returns an empty list for an empty config', () => {
    expect(buildModelItems(undefined, undefined)).toHaveLength(0)
    expect(buildModelItems({ providers: {} }, undefined)).toHaveLength(0)
  })
})

describe('/model interactive picker', () => {
  const piAi = {
    providers: {
      minimax: {
        displayName: 'MiniMax',
        models: [{ id: 'MiniMax-M3', name: 'MiniMax-M3', contextWindow: 200_000 }],
      },
    },
  }

  function agentWithController() {
    const controller = {
      patchAgent: vi.fn(),
      pushSystem: vi.fn(),
      openPicker: vi.fn(),
    }
    const defaultModel = {
      currentSelection: vi.fn().mockReturnValue({ provider: 'minimax', model: 'MiniMax-M3' }),
      saveSelection: vi.fn().mockResolvedValue(undefined),
    }
    const settings = { get: vi.fn().mockReturnValue(piAi) }
    const agent = {
      session: { id: 's1' },
      ctx: {
        get: (key: string) => {
          if (key === 'agentDefaultModel') return defaultModel
          if (key === 'settings') return settings
          if (key === 'kiroController') return controller
          return undefined
        },
      },
    }
    return { agent, controller, defaultModel, settings }
  }

  it('opens the picker with catalog items and a silent success result', async () => {
    const { agent, controller } = agentWithController()
    const handler = (modelCommand as CommandDefinition).handler!
    const outcome = await handler({ agent: agent as never, rawInput: ' ', attachments: [] } as never)

    expect(outcome.kind).toBe('success')
    // Silent: no text so nothing is pushed to the transcript.
    expect((outcome as { text?: string }).text).toBeUndefined()
    expect(controller.openPicker).toHaveBeenCalledTimes(1)
    const request = controller.openPicker.mock.calls[0]![0]
    expect(request.title).toBe('选择模型')
    expect(request.items[0]).toMatchObject({
      value: 'minimax/MiniMax-M3',
      current: true,
    })
  })

  it('persists and patches the status bar on selection', async () => {
    const { agent, controller, defaultModel } = agentWithController()
    const handler = (modelCommand as CommandDefinition).handler!
    await handler({ agent: agent as never, rawInput: '', attachments: [] } as never)

    const request = controller.openPicker.mock.calls[0]![0]
    request.onSelect(request.items[0])

    // onSelect is async; flush the microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(defaultModel.saveSelection).toHaveBeenCalledWith({ provider: 'minimax', model: 'MiniMax-M3' })
    expect(controller.patchAgent).toHaveBeenCalledWith({
      activeProvider: 'minimax',
      activeModel: 'minimax/MiniMax-M3',
      contextLimitTokens: 200_000,
    })
    expect(controller.pushSystem).toHaveBeenCalledWith('模型已切换到 minimax/MiniMax-M3（下一轮生效）')
  })

  it('keeps the direct provider/model path working', async () => {
    const { agent, controller, defaultModel } = agentWithController()
    const handler = (modelCommand as CommandDefinition).handler!
    const outcome = await handler({
      agent: agent as never,
      rawInput: 'scnet/DeepSeek-V4-Flash',
      attachments: [],
    } as never)

    expect(outcome.kind).toBe('success')
    expect(defaultModel.saveSelection).toHaveBeenCalledWith({ provider: 'scnet', model: 'DeepSeek-V4-Flash' })
    expect(controller.patchAgent).toHaveBeenCalledWith({
      activeProvider: 'scnet',
      activeModel: 'scnet/DeepSeek-V4-Flash',
    })
    // scnet is not in the fake config → no contextLimitTokens patch.
    expect(controller.patchAgent.mock.calls[0]![0].contextLimitTokens).toBeUndefined()
  })
})
