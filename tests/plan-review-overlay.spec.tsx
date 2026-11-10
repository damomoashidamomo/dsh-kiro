import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { PlanReviewOverlay } from '../src/ui/PlanReviewOverlay'
import type { QuestionRequestUi } from '../src/runtime/types'

const request: QuestionRequestUi = {
  id: 'plan-review',
  header: 'Plan review',
  question: 'Approve this plan and leave plan mode?',
  detail: '# Refactor the loader\n1. extract parse\n2. add tests',
  options: [
    { label: 'Approve', description: 'Leave plan mode' },
    { label: 'Keep planning', description: 'Stay and revise' },
  ],
  approveLabel: 'Approve',
}

async function settle(ms = 40): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('PlanReviewOverlay', () => {
  it('renders the plan-review panel with question, plan and options', async () => {
    const { lastFrame, unmount } = render(<PlanReviewOverlay request={request} onResolve={() => {}} />)
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('计划评审')
    expect(frame).toContain('Approve this plan')
    expect(frame).toContain('# Refactor the loader')
    expect(frame).toContain('1 Approve')
    expect(frame).toContain('2 Keep planning')
    unmount()
  })

  it('pressing 1 submits the approve answer without custom text', async () => {
    const onResolve = vi.fn()
    const { stdin, unmount } = render(<PlanReviewOverlay request={request} onResolve={onResolve} />)
    await settle()
    stdin.write('1')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'answer', selected: ['Approve'], custom: undefined })
    unmount()
  })

  it('pressing 2 opens the feedback input without answering yet', async () => {
    const onResolve = vi.fn()
    const { stdin, lastFrame, unmount } = render(<PlanReviewOverlay request={request} onResolve={onResolve} />)
    await settle()
    stdin.write('2')
    await settle()
    expect(lastFrame()).toContain('反馈（可选）')
    expect(onResolve).not.toHaveBeenCalled()
    unmount()
  })

  it('Enter on highlighted approve submits the answer', async () => {
    const onResolve = vi.fn()
    const { stdin, unmount } = render(<PlanReviewOverlay request={request} onResolve={onResolve} />)
    await settle()
    stdin.write('\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'answer', selected: ['Approve'], custom: undefined })
    unmount()
  })

  it('Enter on the ✏️ custom row submits ONLY the typed text (regression 0.7.3)', async () => {
    // Exact user flow: ↓ to the custom row, Enter (opens text mode), type the
    // answer, Enter. Used to swallow the text and bounce back to the menu.
    const q: QuestionRequestUi = {
      id: 'q1',
      question: '你想要哪种类型的打火机？',
      options: [
        { label: '煤油防风' },
        { label: '明火复古' },
        { label: '充气蓝焰' },
        { label: '户外战术' },
      ],
    }
    const onResolve = vi.fn()
    const { stdin, unmount } = render(<PlanReviewOverlay request={q} onResolve={onResolve} />)
    await settle()
    for (const _ of [1, 2, 3, 4]) { // ↓ ×4, ONE key per write: ink parses a
      stdin.write('\x1b[B')         // concatenated run as a single arrow
      await settle()
    }
    stdin.write('\r')               // Enter → text mode
    await settle()
    stdin.write('双电弧打火机,充电的')
    await settle()
    stdin.write('\r')                           // Enter → must submit the text
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'answer', selected: [], custom: '双电弧打火机,充电的' })
    unmount()
  })

  it('plan review: digit on a non-approve option + feedback text keeps both', async () => {
    const q: QuestionRequestUi = {
      id: 'q2',
      question: '批准这个计划？',
      options: [{ label: '批准' }, { label: '继续规划' }],
      approveLabel: '批准',
    }
    const onResolve = vi.fn()
    const { stdin, unmount } = render(<PlanReviewOverlay request={q} onResolve={onResolve} />)
    await settle()
    stdin.write('2')          // non-approve digit → feedback mode, 乙 highlighted
    await settle()
    stdin.write('预算一千内')  // optional feedback text
    await settle()
    stdin.write('\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'answer', selected: ['继续规划'], custom: '预算一千内' })
    unmount()
  })

  it('digit-selecting the ✏️ custom row opens text mode directly', async () => {
    const q: QuestionRequestUi = {
      id: 'q3',
      question: '选一个',
      options: [{ label: '甲' }, { label: '乙' }],
    }
    const onResolve = vi.fn()
    const { stdin, lastFrame, unmount } = render(<PlanReviewOverlay request={q} onResolve={onResolve} />)
    await settle()
    stdin.write('3') // = options.length + 1 → the custom row
    await settle()
    expect(lastFrame()).toContain('反馈（可选）')
    stdin.write('我的自定义答案')
    await settle()
    stdin.write('\r')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'answer', selected: [], custom: '我的自定义答案' })
    unmount()
  })

  it('Esc dismisses the panel', async () => {
    const onResolve = vi.fn()
    const { stdin, unmount } = render(<PlanReviewOverlay request={request} onResolve={onResolve} />)
    await settle()
    stdin.write('\x1b')
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'dismissed' })
    unmount()
  })

  it('↓+Enter on Keep planning enters feedback mode; empty Enter submits without custom', async () => {
    const onResolve = vi.fn()
    const { stdin, lastFrame, unmount } = render(<PlanReviewOverlay request={request} onResolve={onResolve} />)
    await settle()
    stdin.write('\x1b[B')            // highlight Keep planning
    await settle()
    stdin.write('\r')                // enter → feedback mode
    await settle()
    expect(lastFrame()).toContain('反馈（可选）')
    stdin.write('\r')                // empty feedback → submit
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'answer', selected: ['Keep planning'], custom: undefined })
    unmount()
  })

  it('feedback text rides along on the answer (batched chunk folds)', async () => {
    const onResolve = vi.fn()
    const { stdin, unmount } = render(<PlanReviewOverlay request={request} onResolve={onResolve} />)
    await settle()
    stdin.write('2')                  // direct select non-approve → feedback mode
    await settle()
    stdin.write('add tests\r')        // PTY often batches text + Enter in one chunk
    await settle()
    expect(onResolve).toHaveBeenCalledWith({ kind: 'answer', selected: ['Keep planning'], custom: 'add tests' })
    unmount()
  })

  it('Esc in feedback mode returns to options without answering', async () => {
    const onResolve = vi.fn()
    const { stdin, lastFrame, unmount } = render(<PlanReviewOverlay request={request} onResolve={onResolve} />)
    await settle()
    stdin.write('2')
    await settle()
    stdin.write('\x1b')               // back out of feedback mode
    await settle()
    expect(onResolve).not.toHaveBeenCalled()
    expect(lastFrame()).toContain('1 Approve')
    unmount()
  })

  it('long plan detail is ellipsized after the line cap', async () => {
    const long: QuestionRequestUi = {
      ...request,
      detail: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n'),
    }
    const { lastFrame, unmount } = render(<PlanReviewOverlay request={long} onResolve={() => {}} />)
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('line 1')
    expect(frame).toContain('行未显示')
    expect(frame).not.toContain('line 20')
    unmount()
  })

  it('generic question (no intent) renders its header and free-text hint', async () => {
    const generic: QuestionRequestUi = {
      id: 'q1', header: 'Confirm', question: 'Proceed?', detail: undefined,
      options: [{ label: 'Yes', description: undefined }, { label: 'No', description: undefined }],
      approveLabel: undefined,
    }
    const { lastFrame, unmount } = render(<PlanReviewOverlay request={generic} onResolve={() => {}} />)
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Confirm')
    expect(frame).not.toContain('计划评审')
    unmount()
  })
})
