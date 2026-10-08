import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Prompt } from '../src/ui/Prompt'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

describe('Prompt oversized paste spill (P2)', () => {
  it('a fragmented 10KB paste spills the draft to .kiro/paste', async () => {
    const submitted: string[] = []
    const { lastFrame, stdin, unmount } = render(
      <Prompt busy={false} onSubmit={(text) => { submitted.push(text) }} />,
    )
    // let ink mount before writing (writes before mount are dropped)
    await new Promise((r) => setTimeout(r, 50))
    const payload = 'LOGDATA 2026-10-08 sample line for spill test\n'.repeat(240).slice(0, 10240)
    // deliver in PTY-sized fragments like a real terminal
    for (let i = 0; i < payload.length; i += 512) {
      stdin.write(payload.slice(i, i + 512))
    }
    await new Promise((r) => setTimeout(r, 600))
    const frame = lastFrame() ?? ''
    console.log('submitted count:', submitted.length, '| first:', JSON.stringify(submitted[0]?.slice(0, 40)))
    console.log('frame tail:', JSON.stringify(frame.split('\n').filter(l => l.trim()).slice(-3)))
    expect(frame).toContain('粘贴')
    expect(frame).toContain('.kiro/paste/')
    expect(submitted.length).toBe(0)
    expect(existsSync(join(process.cwd(), '.kiro', 'paste'))).toBe(true)
    expect(readdirSync(join(process.cwd(), '.kiro', 'paste')).length).toBe(1)
    unmount()
    rmSync(join(process.cwd(), '.kiro', 'paste'), { recursive: true, force: true })
  })
})
