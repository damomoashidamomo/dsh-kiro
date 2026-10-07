/**
 * kiro-steering — discovers `.kiro/steering/*.md` and `~/.kiro/steering/*.md`,
 * parses each file's frontmatter, and publishes the resolved list on the
 * Cordis context so the runtime can inject them into the system prompt.
 *
 * @module @damomoashidamomo/dsh-kiro/steering
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  loadSteeringFiles,
  resolveApplicableSteering,
  type SteeringFile,
} from './loader'

/** Service identifier for the parsed steering-file list. */
export const KIRO_STEERING = 'kiroSteering'

/** Stable Cordis plugin name. */
export const name = 'kiro-steering'

/** Compose the system-prompt payload from the applicable files. */
export function composeSteeringPrompt(applicable: readonly SteeringFile[]): string {
  if (applicable.length === 0) return ''
  // User-level guidance first, project-level last: later text wins attention,
  // matching the platform's "more specific instructions take precedence".
  const ordered = [...applicable].sort((a, b) => (a.source === b.source ? 0 : a.source === 'user' ? -1 : 1))
  let budget = STEERING_MAX_CHARS
  const blocks: string[] = []
  for (const file of ordered) {
    if (budget <= 0) break
    const take = Math.min(file.content.length, budget)
    budget -= take
    const desc = file.description !== '' ? ` — ${file.description}` : ''
    blocks.push(`## ${file.name}${desc}\n\n${file.content.slice(0, take)}${take < file.content.length ? '\n…(truncated)' : ''}`)
  }
  const intro = 'The following steering files are persistent user-authored guidance loaded from .kiro/steering/. Project-level entries come after user-level ones and take precedence. Follow this guidance unless the user explicitly overrides it for the current request.'
  return `${intro}\n\n${blocks.join('\n\n')}`
}

/** Soft cap so a runaway steering directory cannot eat the context. */
const STEERING_MAX_CHARS = 32_000

/** Module-level snapshot for command handlers (they cannot reach ctx). */
let steeringState: { files: readonly SteeringFile[]; applicable: readonly SteeringFile[]; sectionChars: number } | undefined

/** Latest loaded steering state, for /steering. */
export function getKiroSteering(): typeof steeringState {
  return steeringState
}

/** Reload hook (set by apply; /steering reload calls it). */
let steeringReload: (() => void) | undefined

/** Re-read the steering directories and swap the section in place. */
export function reloadKiroSteering(): boolean {
  if (steeringReload === undefined) return false
  steeringReload()
  return true
}

/** Latest steering section text (mutable so reload can swap it in place). */
let sectionText = ''

/** Mount the loader and inject the guidance as a system-prompt section. */
export function apply(ctx: Context): void {
  const reload = (): void => {
    const files = loadSteeringFiles()
    const applicable = resolveApplicableSteering(process.cwd(), files)
    sectionText = composeSteeringPrompt(applicable)
    steeringState = { files, applicable, sectionChars: sectionText.length }
    ctx.logger.info?.(`dsh-kiro: kiro-steering reloaded (${applicable.length}/${files.length} applicable to ${process.cwd()})`)
  }
  reload()
  ctx.provide(KIRO_STEERING, {
    get files() { return steeringState?.files ?? [] },
    get applicable() { return steeringState?.applicable ?? [] },
    get sectionChars() { return steeringState?.sectionChars ?? 0 },
  })
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'kiro:steering',
      // After TEAM_POLICY (600), before PTC_ONLY (800): persistent guidance
      // sits with the policy sections, ahead of the tool docs.
      order: 650,
      text: () => sectionText,
    })
  })
  steeringReload = reload
}

export type { SteeringFile } from './loader'
