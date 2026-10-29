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
  it('renders the tool, reason, and four kiro-style options', async () => {
    const { instance } = mounted()
    await settle()
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain('工具需要批准')
    expect(frame).toContain('bash')
    expect(frame).toContain('escalate sandbox')
    expect(frame).toContain('1 允许一次')
    expect(frame).toContain('2 本会话始终允许 (bash)')
    expect(frame).toContain('3 本项目始终允许')
    expect(frame).toContain('4 拒绝')
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

  it('4 then a reason then Enter denies with the reason', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('4')
    await settle()
    expect(onResolve).not.toHaveBeenCalled()
    instance.stdin.write('别动系统文件\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'deny', reason: '别动系统文件' })
  })

  it('4 then bare Enter denies without a reason', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('4')
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
    instance.stdin.write('4')
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

  it('PTY-batched chunk (4 + reason + Enter in one write) is handled byte-wise', async () => {
    const { onResolve, instance } = mounted()
    await settle()
    instance.stdin.write('4no\r')
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


describe('trust-scope selector (kiro-style granularity)', () => {
  it('picking 2 (session) with a command opens the scope step', async () => {
    const onResolve = vi.fn()
    const { lastFrame, stdin, unmount } = render(
      React.createElement(ApprovalOverlay, {
        request: { toolName: 'bash', reason: undefined },
        approvalCommand: 'grep -n foo bar.txt',
        onResolve,
      }),
    )
    await sleep(40)
    stdin.write('2')
    await sleep(40)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('信任范围')
    expect(frame).toContain('整个工具')
    expect(frame).toContain('仅此命令')
    expect(frame).toContain('前缀「grep …」')
    expect(onResolve).not.toHaveBeenCalled()
    unmount()
  })

  it('choosing 仅此命令 resolves allow-session with the full command pattern', async () => {
    const onResolve = vi.fn()
    const { stdin, unmount } = render(
      React.createElement(ApprovalOverlay, {
        request: { toolName: 'bash', reason: undefined },
        approvalCommand: 'grep -n foo bar.txt',
        onResolve,
      }),
    )
    await sleep(40)
    stdin.write('2')
    await sleep(40)
    stdin.write('\r')
    await sleep(40)
    expect(onResolve).toHaveBeenCalledWith({ kind: 'allow-session', scope: 'tool' })
    unmount()
  })

  it('Esc from the scope step returns to the main options', async () => {
    const onResolve = vi.fn()
    const { lastFrame, stdin, unmount } = render(
      React.createElement(ApprovalOverlay, {
        request: { toolName: 'bash', reason: undefined },
        approvalCommand: 'grep -n foo bar.txt',
        onResolve,
      }),
    )
    await sleep(40)
    stdin.write('2')
    await sleep(40)
    stdin.write('\x1b')
    await sleep(40)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('允许一次')
    expect(frame).not.toContain('信任范围')
    expect(onResolve).not.toHaveBeenCalled()
    unmount()
  })
})

describe('answerer pattern auto-allow', () => {
  it('a matching stored pattern skips the panel entirely', async () => {
    const { createApprovalAnswerer } = await import('../src/runtime/approval-answerer')
    let opened = 0
    const ui = {
      isToolAllowedForSession: (t: string) => t === 'never',
      allowToolForSession: () => {},
      allowToolForProject: () => {},
      latestToolArgs: () => JSON.stringify({ command: 'grep -n foo bar.txt' }),
      matchesTrustPattern: (t: string, args: string | undefined) => t === 'bash' && (args ?? '').includes('grep'),
    }
    const answerer = createApprovalAnswerer(ui as never, { inject: () => {} })
    const outcome = await answerer({ toolName: 'bash' })
    expect(outcome).toBe('allowed-once')
    expect(opened).toBe(0)
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
