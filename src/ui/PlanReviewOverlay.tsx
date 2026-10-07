/**
 * Panel for a pending structured question — plan review (`exit_plan_mode`)
 * and generic asks. Mirrors the approval panel's key model: number keys
 * direct-select, ↑↓+Enter list select, Esc dismisses (the model is told to
 * stay and wait for the user's own words), Ctrl+C stays with the App's
 * two-stage interrupt (cancels the turn, which aborts the question).
 *
 * Plan-review extra: choosing a NON-approve option opens a one-line
 * optional feedback input whose text goes back to the model (custom).
 * An approve selection never carries text (platform contract). Questions
 * without options are free-text only (custom answer, empty list).
 *
 * @module @damomoashidamomo/dsh-kiro/ui/plan-review-overlay
 */

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { palette } from '../theme/palette'
import type { QuestionChoice, QuestionRequestUi } from '../runtime/types'

/** Cap on rendered detail (plan markdown) lines before an ellipsis marker. */
const DETAIL_LINE_CAP = 14

export interface PlanReviewOverlayProps {
  readonly request: QuestionRequestUi
  readonly onResolve: (choice: QuestionChoice) => void
}

export function PlanReviewOverlay({ request, onResolve }: PlanReviewOverlayProps): JSX.Element {
  const options = request.options
  const [highlighted, setHighlighted] = useState(0)
  const isPlanReview = request.approveLabel !== undefined
  // Local (non-state) buffers fold PTY-batched chunks, like the approval
  // panel: React state set inside the synchronous key loop would not be
  // visible to later bytes of the same chunk.
  const [textMode, setTextMode] = useState(options.length === 0)
  const [text, setText] = useState('')

  const submit = (selected: string[], custom: string | undefined): void => {
    onResolve({ kind: 'answer', selected, custom })
  }

  useInput((input, key) => {
    // Fold PTY-batched chunks through LOCAL mode/buffer/index state (React
    // state writes inside one synchronous loop are not visible to later
    // bytes of the same chunk); committed state catches up at the end.
    const submitText = (buffer: string, index: number): void => {
      const trimmed = buffer.trim()
      if (options.length === 0) {
        submit([], trimmed === '' ? undefined : trimmed)
        return
      }
      const chosen = options[index]?.label
      if (chosen !== undefined) submit([chosen], trimmed === '' ? undefined : trimmed)
    }
    const pick = (index: number): void => {
      const chosen = options[index]?.label
      if (chosen === undefined) {
        setTextMode(true)
        return
      }
      if (isPlanReview && chosen !== request.approveLabel) {
        setHighlighted(index)
        setTextMode(true)
        return
      }
      submit([chosen], undefined)
    }

    if (input === '') {
      // Single key event (Enter/arrows/Esc/backspace arrive parsed).
      if (textMode) {
        if (key.return) submitText(text, highlighted)
        else if (key.escape) { setTextMode(false); setText('') }
        else if (key.delete || key.backspace) setText((prev) => prev.slice(0, -1))
        return
      }
      if (key.return) pick(highlighted)
      else if (key.upArrow) setHighlighted((prev) => (prev - 1 + options.length) % options.length)
      else if (key.downArrow) setHighlighted((prev) => (prev + 1) % options.length)
      else if (key.escape) onResolve({ kind: 'dismissed' })
      return
    }

    // Printable run (may embed CR or DEL bytes — fold byte by byte).
    let mode = textMode
    let buffer = text
    let index = highlighted
    for (const ch of input) {
      if (mode) {
        if (ch === '\r' || ch === '\n') {
          setTextMode(false)
          submitText(buffer, index)
          return
        }
        if (ch === '\x1b') {
          setTextMode(false)
          setText('')
          return
        }
        if (ch === '\b' || ch === '\x7f') buffer = buffer.slice(0, -1)
        else if (ch >= ' ') buffer += ch
        continue
      }
      if (ch === '\x1b') {
        onResolve({ kind: 'dismissed' })
        return
      }
      if (ch === '\r' || ch === '\n') {
        pick(index)
        return
      }
      const direct = Number.parseInt(ch, 10)
      if (Number.isInteger(direct) && direct >= 1 && direct <= options.length) {
        const label = options[direct - 1]?.label
        if (label !== undefined && isPlanReview && label !== request.approveLabel) {
          index = direct - 1
          setHighlighted(index)
          mode = true
          buffer = ''
          continue
        }
        if (label !== undefined) {
          submit([label], undefined)
          return
        }
      }
    }
    setTextMode(mode)
    setText(buffer)
  })

  const detailLines = (request.detail ?? '').split('\n')
  const detailShown = detailLines.slice(0, DETAIL_LINE_CAP)
  const detailEllipsized = detailLines.length > DETAIL_LINE_CAP

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold>{palette.warning(isPlanReview ? '📋 计划评审' : (request.header ?? '❓ 需要你的回答'))}</Text>
      <Text>{request.question}</Text>
      {request.detail !== undefined && request.detail !== '' ? (
        <Box flexDirection="column" marginTop={1}>
          {detailShown.map((line, index) => (
            <Text key={index} dimColor={!line.startsWith('#')}>
              {line === '' ? ' ' : line}
            </Text>
          ))}
          {detailEllipsized ? (
            <Text dimColor>…（{detailLines.length - DETAIL_LINE_CAP} 行未显示）</Text>
          ) : null}
        </Box>
      ) : null}
      {options.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {options.map((option, index) => (
            <Text key={option.label} color={index === highlighted ? 'yellow' : undefined}>
              {index === highlighted ? '❯ ' : '  '}{index + 1} {option.label}
              {option.description !== undefined ? <Text dimColor> — {option.description}</Text> : null}
            </Text>
          ))}
        </Box>
      ) : null}
      {textMode ? (
        <Box marginTop={1}>
          <Text>
            {options.length === 0 ? '回答：' : '反馈（可选）：'}
            <Text color="green">{text}</Text>
            <Text dimColor>|</Text>
          </Text>
        </Box>
      ) : (
        <Text dimColor>数字直选 · ↑↓+Enter · Esc=插话（回到输入框）</Text>
      )}
    </Box>
  )
}
