import { describe, it, expect, vi } from 'vitest'
import { routeTurnInput, type TurnInputTarget } from '../src/runtime/turn-input'
import { applyMentionInsert } from '../src/runtime/input'

function fakeAgent(status: string): TurnInputTarget & {
  steer: ReturnType<typeof vi.fn>
  followup: ReturnType<typeof vi.fn>
} {
  return { status, steer: vi.fn(), followup: vi.fn() }
}

describe('routeTurnInput (steering branch)', () => {
  it('steers a running turn instead of queueing', () => {
    const agent = fakeAgent('running')
    const message = { content: [] }
    expect(routeTurnInput(agent, message)).toBe('steer')
    expect(agent.steer).toHaveBeenCalledWith(message)
    expect(agent.followup).not.toHaveBeenCalled()
  })

  it('opens a new turn when idle', () => {
    const agent = fakeAgent('idle')
    const message = { content: [] }
    expect(routeTurnInput(agent, message)).toBe('followup')
    expect(agent.followup).toHaveBeenCalledWith(message)
    expect(agent.steer).not.toHaveBeenCalled()
  })

  it('queues for the next turn while cancelling (platform rule)', () => {
    const agent = fakeAgent('cancelling')
    expect(routeTurnInput(agent, {})).toBe('followup')
    expect(agent.followup).toHaveBeenCalled()
  })

  it('queues on any other non-running status (e.g. error)', () => {
    const agent = fakeAgent('error')
    expect(routeTurnInput(agent, {})).toBe('followup')
  })
})

describe('applyMentionInsert (@-mention completion)', () => {
  it('replaces the trailing query token and adds a space', () => {
    expect(applyMentionInsert('看看 @read', '@read', '@README.md ')).toBe('看看 @README.md ')
  })
  it('falls back to appending when the token was edited away', () => {
    expect(applyMentionInsert('draft changed', '@gone', '@src/')).toBe('draft changed@src/ ')
  })
  it('keeps the quoted grammar for paths with spaces', () => {
    expect(applyMentionInsert('@"my fil', '@"my fil', '@"my file.md" ')).toBe('@"my file.md" ')
  })
})
