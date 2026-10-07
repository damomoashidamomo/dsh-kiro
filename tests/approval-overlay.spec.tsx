import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { ApprovalOverlay } from '../src/ui/ApprovalOverlay'

const request = { toolName: 'bash', reason: 'escalate sandbox to danger-full-access: write /tmp/x' }

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 40))
}

function mounted() {
  const onResolve = vi.fn()
  const instance = render(<ApprovalOverlay request={request} onResolve={onResolve} />)
  return { onResolve, instance }
}

describe('ApprovalOverlay', () => {
  it('renders the tool, reason, and three kiro-style options', async () => {
    const { instance } = mounted()
    await settle()
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain('工具需要批准')
    expect(frame).toContain('bash')
    expect(frame).toContain('escalate sandbox')
    expect(frame).toContain('1 允许一次')
    expect(frame).toContain('2 本会话始终允许 (bash)')
    expect(frame).toContain('3 拒绝')
  })

  it('1 allows once', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('1')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'allow-once' })
  })

  it('2 allows for the session', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('2')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'allow-session' })
  })

  it('3 then a reason then Enter denies with the reason', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('3')
    await settle()
    expect(onResolve).not.toHaveBeenCalled()
    instance.stdin.write('别动系统文件\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'deny', reason: '别动系统文件' })
  })

  it('3 then bare Enter denies without a reason', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('3')
    await settle()
    instance.stdin.write('\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'deny', reason: undefined })
  })

  it('Esc denies outright from the option list', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('\x1b')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'deny', reason: undefined })
  })

  it('Esc during reason input denies outright', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('3')
    await settle()
    instance.stdin.write('\x1b')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'deny', reason: undefined })
  })

  it('arrows move the highlight and Enter picks', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('\x1b[B')      // ↓ to option 2
    await settle()
    instance.stdin.write('\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'allow-session' })
  })

  it('PTY-batched chunk (3 + reason + Enter in one write) is handled byte-wise', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('3no\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'deny', reason: 'no' })
  })

  it('omits the reason row when the request carries none', async () => {
    const onResolve = vi.fn()
    const instance = render(
      <ApprovalOverlay request={{ toolName: 'bash', reason: undefined }} onResolve={onResolve} />,
    )
    await settle()
    const frame = instance.lastFrame() ?? ''
    expect(frame).not.toContain('原因:')
    expect(frame).toContain('工具需要批准')
  })
})
