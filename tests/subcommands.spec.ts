import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMMAND_PICKERS, pickerFor, pickerCommandNames } from '../src/commands/subcommands'

/**
 * The picker must list EVERY subcommand a command accepts. Rather than trust
 * the table, cross-check it against the `case '…'` labels of each handler and
 * against the `input: { hint: '<a|b|c>' }` enumeration in the command
 * definition. A new subcommand therefore cannot silently stay hidden from
 * `/command` + Enter (the reported bug: `/chat` never showed `delete`/`help`).
 */

const COMMAND_DIR = join(import.meta.dirname, '..', 'src', 'commands')

/** Generic placeholders a usage hint uses instead of literal values. */
const PLACEHOLDERS = new Set([
  'level', 'n', 'feature', 'name', 'id', 'index', 'query', 'path', 'text',
  'args', 'arg', 'desc', 'on', 'off', '意见', '描述',
])

/** Aliases whose row is not listed separately in the picker. */
const ALIASES: Record<string, readonly string[]> = {
  context: ['rm'], // remove 的别名
  knowledge: ['view'], // show 的别名
}

function sourceOf(file: string): string {
  return readFileSync(join(COMMAND_DIR, `${file}.ts`), 'utf8')
}

/** `case 'xyz':` labels inside the command handler. */
function caseLabels(source: string): string[] {
  const labels = new Set<string>()
  for (const match of source.matchAll(/case '([a-z][a-z0-9-]*)':/gu)) {
    if (match[1] !== undefined) labels.add(match[1])
  }
  return [...labels].sort()
}

/** First token of every picker row (the subcommand actually dispatched). */
function rowTokens(name: string): string[] {
  const picker = COMMAND_PICKERS[name]
  if (picker === undefined) return []
  return [...new Set(picker.rows.map((row) => row.value.split(/\s+/u)[0] ?? row.value))].sort()
}

function commandFiles(): string[] {
  return readdirSync(COMMAND_DIR)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => file.replace(/\.ts$/u, ''))
    .filter((file) => file !== 'registry' && file !== 'subcommands')
}

describe('subcommand catalog', () => {
  it('lists every handler subcommand (no hidden ones)', () => {
    const problems: string[] = []
    for (const name of pickerCommandNames()) {
      const labels = caseLabels(sourceOf(name))
      if (labels.length === 0) continue // handler not switch-based (e.g. /engine)
      const allowed = new Set([...rowTokens(name), ...(ALIASES[name] ?? [])])
      for (const label of labels) {
        if (!allowed.has(label)) problems.push(`${name}: handler has '${label}' but the picker omits it`)
      }
    }
    expect(problems).toEqual([])
  })

  it('never invents a subcommand the handler does not accept', () => {
    const problems: string[] = []
    for (const name of pickerCommandNames()) {
      const labels = caseLabels(sourceOf(name))
      if (labels.length === 0) continue
      const known = new Set([...labels, ...(ALIASES[name] ?? [])])
      for (const token of rowTokens(name)) {
        if (!known.has(token) && token !== 'help') problems.push(`${name}: picker offers '${token}' which the handler does not handle`)
      }
    }
    expect(problems).toEqual([])
  })

  it('gives every multi-subcommand command a picker', () => {
    const missing: string[] = []
    for (const file of commandFiles()) {
      const labels = caseLabels(sourceOf(file)).filter((label) => label !== 'help')
      if (labels.length < 2) continue
      if (pickerFor(file) === undefined) missing.push(`${file}: ${labels.join('|')}`)
    }
    expect(missing).toEqual([])
  })

  it('covers the values the command definition advertises in its usage hint', () => {
    const problems: string[] = []
    for (const name of pickerCommandNames()) {
      const source = sourceOf(name)
      const hint = /input: \{ hint: '[^<]*<([^>]*)>/u.exec(source)?.[1]
      if (hint === undefined) continue
      const tokens = new Set(rowTokens(name))
      for (const value of hint.split('|')) {
        // Skip placeholders (`<level>`, `<n>`), dotted forms and blanks:
        // only literal alternatives have to be offered as rows.
        if (value === '' || value.includes('/') || value.includes(' ') || PLACEHOLDERS.has(value)) continue
        if (!tokens.has(value) && !(ALIASES[name] ?? []).includes(value)) {
          problems.push(`${name}: usage advertises '${value}' but the picker omits it`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('marks rows that need arguments so the picker pre-fills instead of running', () => {
    // Guards the picker's "prefill vs submit" split: a row with a placeholder
    // argument must be needsArg, a bare value must not be.
    const problems: string[] = []
    for (const [name, picker] of Object.entries(COMMAND_PICKERS)) {
      for (const row of picker.rows) {
        const hasPlaceholder = /<[^>]+>/u.test(row.value)
        if (hasPlaceholder && row.needsArg !== true) problems.push(`${name}: '${row.value}' needs args but is submitted`)
        if (!hasPlaceholder && row.needsArg === true) problems.push(`${name}: '${row.value}' takes no args but only pre-fills`)
      }
    }
    expect(problems).toEqual([])
  })

  it('/chat offers every chat action, including delete and help', () => {
    const chat = pickerFor('chat')
    expect(chat).toBeDefined()
    const tokens = chat!.rows.map((row) => row.value.split(/\s+/u)[0])
    for (const action of ['list', 'new', 'resume', 'delete', 'help']) {
      expect(tokens).toContain(action)
    }
  })
})

describe('candidate ranking', () => {
  it('ranks an exact command name first, so Enter runs what is highlighted', async () => {
    const { rankCandidates } = await import('../src/ui/Autocomplete')
    const items = [
      { label: '/model', insert: 'model', hint: 'Select the model' },
      { label: '/mode', insert: 'mode', hint: 'Switch Kiro agent mode' },
    ]
    // "/mode" used to run "/model" here: both contain the query, and the
    // registry ships /model first.
    expect(rankCandidates(items, 'mode')[0]?.label).toBe('/mode')
    expect(rankCandidates(items, 'mode')[1]?.label).toBe('/model')
    // A prefix still beats a mid-string hit.
    expect(rankCandidates(items, 'mod').map((i) => i.label)).toEqual(['/model', '/mode'])
    // Hint-only matches come last.
    const hinted = [{ label: '/x', hint: 'about models' }, { label: '/model', hint: 'y' }]
    expect(rankCandidates(hinted, 'model').map((i) => i.label)).toEqual(['/model', '/x'])
  })

  it('respects the row limit after ranking', async () => {
    const { rankCandidates } = await import('../src/ui/Autocomplete')
    const items = [
      { label: '/changelog', hint: 'c' },
      { label: '/chat', hint: 'ch' },
      { label: '/checkpoint', hint: 'k' },
    ]
    expect(rankCandidates(items, 'chat', 1)).toEqual([{ label: '/chat', hint: 'ch' }])
  })
})
