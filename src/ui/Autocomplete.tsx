/**
 * Autocomplete — a small popover that lists fuzzy-matched candidates when the
 * user types `@` or `/`. Used by both reference lookups (skills, MCP tools,
 * saved prompts) and slash-command discovery.
 *
 * @module @damomoashidamomo/dsh-kiro/ui/Autocomplete
 */

import { Box, Text } from 'ink'
import Fuse from 'fuse.js'
import { palette } from '../theme/palette'

export interface AutocompleteItem {
  /** Insertion text once the user confirms (without the trigger character). */
  readonly insert: string
  /** Display label rendered in the list. */
  readonly label: string
  /** Optional secondary line (description, server name, …). */
  readonly hint?: string
  /** Searchable extra tokens. */
  readonly keywords?: readonly string[]
}

export interface AutocompleteProps {
  /** Trigger character: '/' or '@'. */
  readonly trigger: '/' | '@'
  /** Current query (without the trigger character). */
  readonly query: string
  /** Candidate pool. */
  readonly candidates: readonly AutocompleteItem[]
  /** Index of the currently highlighted candidate. */
  readonly selected: number
  /** Maximum number of candidates to render. */
  readonly maxVisible?: number
}

/** Render the autocomplete popover. */
export function Autocomplete({ trigger, query, candidates, selected, maxVisible = 6 }: AutocompleteProps): JSX.Element {
  const fuse = new Fuse(candidates, {
    keys: ['label', 'hint', 'keywords'],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 1,
  })
  const filtered = query === '' ? candidates.slice(0, maxVisible) : fuse.search(query).map((r) => r.item).slice(0, maxVisible)
  if (filtered.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={0}>
        <Text dimColor>{palette.muted(`no ${trigger === '/' ? 'commands' : 'references'} match "${query}"`)}</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" paddingX={1} marginTop={0} borderStyle="round" borderColor={palette.enabled ? 'green' : undefined}>
      <Text>{palette.muted(` ${trigger} ${query === '' ? '' : query}_ `)}</Text>
      <Box flexDirection="column" paddingX={1}>
        {filtered.map((item, idx) => {
          const isSelected = idx === selected
          const cursor = isSelected ? palette.accent('▸ ') : '  '
          const label = isSelected ? palette.accent(item.label) : item.label
          const hint = item.hint !== undefined ? palette.muted(`  ${item.hint}`) : ''
          return (
            <Text key={`${trigger}-${item.insert}`}>
              <Text>{cursor}</Text>
              <Text>{label}</Text>
              <Text>{hint}</Text>
            </Text>
          )
        })}
      </Box>
    </Box>
  )
}

/** Built-in slash-command candidate list (all 25 shipped commands). */
export function slashCandidates(items: ReadonlyArray<{ name: string; description: string }>): AutocompleteItem[] {
  return items.map((item) => ({
    insert: item.name,
    label: `/${item.name}`,
    hint: item.description,
  }))
}
