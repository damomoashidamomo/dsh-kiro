import { describe, it, expect } from 'vitest'
import { chatPickerRows, sessionRowBudget } from '../src/ui/pickerRows'
import { pickerFor } from '../src/commands/subcommands'
import { PICKER_SESSIONS } from '../src/commands/chat'

/**
 * The /chat menu lists the recent sessions right after `resume <id>` and keeps
 * the `list` row for the full table. With 40 sessions on disk the old menu
 * showed only four, and a truncated list said nothing about the rest.
 */

const sessions = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `session-0000${String(i).padStart(4, '0')}-aaaa-bbbb`,
  title: i === 0 ? '重构登录流程' : '',
  when: `2026-11-0${(i % 9) + 1} 1${i % 9}:00`,
}))

const subs = pickerFor('chat')!.rows

describe('chat picker rows', () => {
  it('puts the sessions directly after the resume row, before delete/help', () => {
    const rows = chatPickerRows(subs, sessions(3), 3, 20)
    const values = rows.map((row) => row.value)
    const resumeAt = values.indexOf('resume <id>')
    expect(resumeAt).toBeGreaterThan(-1)
    expect(values[resumeAt + 1]).toMatch(/^resume session-/u)
    expect(values[resumeAt + 3]).toMatch(/^resume session-/u)
    expect(values[resumeAt + 4]).toBe('delete <id>')
    expect(values[values.length - 1]).toBe('help')
  })

  it('keeps every static subcommand when sessions are inserted', () => {
    const rows = chatPickerRows(subs, sessions(20), 40, 20)
    for (const row of subs) {
      expect(rows.map((r) => r.value)).toContain(row.value)
    }
  })

  it('shows the title when there is one, the timestamp otherwise', () => {
    const rows = chatPickerRows(subs, sessions(2), 2, 20)
    const sessionRows = rows.filter((row) => row.value.startsWith('resume session-'))
    expect(sessionRows[0]?.hint).toBe('重构登录流程')
    expect(sessionRows[1]?.hint).toBe('2026-11-02 11:00')
  })

  it('caps the session rows at the height budget but keeps the total visible', () => {
    const rows = chatPickerRows(subs, sessions(20), 40, 6)
    const sessionRows = rows.filter((row) => row.value.startsWith('resume session-'))
    expect(sessionRows).toHaveLength(6)
    const list = rows.find((row) => row.value === 'list')
    expect(list?.hint).toContain('40')
    expect(list?.hint).toContain('全部')
  })

  it('says nothing about a full list when everything fits', () => {
    const rows = chatPickerRows(subs, sessions(3), 3, 20)
    expect(rows.find((row) => row.value === 'list')?.hint).toBe('列出会话（含时间与简介）')
  })

  it('budgets rows from the terminal height, never below four', () => {
    expect(sessionRowBudget(40, 5)).toBe(20) // plenty of room → cap at 20
    expect(sessionRowBudget(30, 5)).toBe(20)
    expect(sessionRowBudget(16, 5)).toBe(7)
    expect(sessionRowBudget(10, 5)).toBe(4) // too short → floor
    expect(sessionRowBudget(undefined, 5)).toBe(20)
  })

  it('holds the shipped ceiling at 20 sessions', () => {
    expect(PICKER_SESSIONS).toBe(20)
  })
})
