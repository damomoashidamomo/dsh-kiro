import { describe, it, expect, vi } from 'vitest'
import { routeTurnInput, type TurnInputTarget } from '../src/runtime/turn-input'
import { applyMentionInsert, spillPaste, PASTE_SPILL_THRESHOLD } from '../src/runtime/input'
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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


describe('spillPaste (P2 oversized paste protection)', () => {
  const dir = join(tmpdir(), 'kiro-spill-test')
  it('below threshold returns undefined and writes nothing', () => {
    rmSync(dir, { recursive: true, force: true })
    expect(spillPaste('x'.repeat(PASTE_SPILL_THRESHOLD - 1), dir)).toBeUndefined()
    expect(existsSync(join(dir, '.kiro', 'paste'))).toBe(false)
  })
  it('oversized payload lands in .kiro/paste with a mention path', () => {
    rmSync(dir, { recursive: true, force: true })
    const big = 'log-line\n'.repeat(1500) // ~12KB
    const spill = spillPaste(big, dir)
    expect(spill).toBeDefined()
    expect(spill!.bytes).toBeGreaterThan(8192)
    expect(spill!.mention).toMatch(/^\.kiro\/paste\/paste-\d{14}\.txt$/)
    const written = readFileSync(spill!.path, 'utf8')
    expect(written.length).toBe(big.length)
    rmSync(dir, { recursive: true, force: true })
  })
})
