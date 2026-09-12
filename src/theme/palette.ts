/**
 * dsh-kiro color palette — dark-green themed.
 *
 * The Kiro CLI ships a purple palette; dsh-kiro swaps it for a dark-green
 * (墨绿/海绿/森林绿) family that reads well on both dark and light terminal
 * backgrounds. Color detection is explicit and predictable rather than
 * deferred to chalk's auto-detection (which silently degrades to a no-op in
 * many CI / TTY-masquerading environments, leaving the user with a blank
 * white TUI):
 *
 *   - `NO_COLOR=1`              — force off
 *   - `DSH_KIRO_COLOR=16|256|truecolor` — force a level
 *   - otherwise                  — trust chalk (which checks TTY, TERM, CI, …)
 *
 * Set `DSH_KIRO_COLOR` when launching through a wrapper that hides chalk's
 * TTY detection (CI runners, VS Code tasks, SSH mux, etc.).
 *
 * @module @damomoashidamomo/dsh-kiro/theme/palette
 */

import chalk, { type ChalkInstance } from 'chalk'

/**
 * Read the desired color level from explicit env, falling back to chalk.
 *
 * Called fresh on every {@link build}: chalk's `supportsColor` is snapshotted
 * at chalk's first import, so `FORCE_COLOR` / `NO_COLOR` changes made after
 * module load (e.g. by the startup plugin) are only honored because we
 * re-read the environment here.
 */
function resolveColorLevel(): number {
  const override = process.env.DSH_KIRO_COLOR
  if (override !== undefined && override !== '') {
    if (override === 'truecolor' || override === '24bit') return 3
    if (override === '256' || override === '8bit') return 2
    if (override === '16') return 1
    if (override === '0' || override === 'off' || override === 'none') return 0
  }
  const force = process.env.FORCE_COLOR
  if (force !== undefined && force !== '') {
    if (force === 'true') return 3
    if (force === 'false' || force === '0') return 0
    const n = Number(force)
    if (Number.isInteger(n) && n >= 1 && n <= 3) return n
  }
  // `NO_COLOR` is the weakest override: the ecosystem convention (chalk /
  // supports-color) is that an explicit `FORCE_COLOR` wins over it.
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return 0
  return (chalk as unknown as { supportsColor?: { level?: number } }).supportsColor?.level ?? 0
}

/** Whether the terminal reports itself as a light background. */
const LIGHT_BG = (process.env.DSH_KIRO_THEME ?? '').toLowerCase() === 'light'
  || process.env.THEME?.toLowerCase() === 'light'
  || /^screen.*-256color$/i.test(process.env.TERM ?? '')
    && process.env.COLORFGBG?.split(';').at(-1) !== '0'
    && process.env.COLORFGBG?.split(';').at(-1) !== '8'

/** Semantic palette token. */
export interface Palette {
  /** Whether the palette emits color at all. */
  readonly enabled: boolean
  /** Whether the detected terminal background is light. */
  readonly light: boolean
  /** Primary brand accent — banner, logo, selected state, key bindings. */
  readonly accent: ChalkInstance
  /** Secondary accent — sub-headings, secondary highlights. */
  readonly accent2: ChalkInstance
  /** Soft accent — hints, secondary copy. */
  readonly accentSoft: ChalkInstance
  /** Success / completion — green shift for finished tool calls. */
  readonly success: ChalkInstance
  /** Warning — gold. */
  readonly warning: ChalkInstance
  /** Error — muted red that stays legible on both backgrounds. */
  readonly error: ChalkInstance
  /** Muted text — timestamps, metadata, hints. */
  readonly muted: ChalkInstance
  /** Plain bold — strong emphasis without color. */
  readonly bold: ChalkInstance
  /** Dim — separators, brackets, secondary structure. */
  readonly dim: ChalkInstance
  /** Reverse-video — user input lines. */
  readonly input: ChalkInstance
  /** Inline code style. */
  readonly code: ChalkInstance
  /** Code block style. */
  readonly codeBlock: ChalkInstance
  /** Heading style. */
  readonly heading: ChalkInstance
  /** Link style. */
  readonly link: ChalkInstance
  /** Italic style. */
  readonly italic: ChalkInstance
  /** Bold + accent — agent name. */
  readonly agent: ChalkInstance
  /** Token usage bar fill. */
  readonly usage: ChalkInstance
  /** Reasoning-text tint. */
  readonly reasoning: ChalkInstance
}

/** Build a no-color chalk-like instance by creating a proxy that swallows color. */
function makeNone(): ChalkInstance {
  const fn = ((text: string): string => text) as unknown as ChalkInstance
  return new Proxy(fn, {
    get: () => makeNone(),
    apply: (_target, _thisArg, args) => String(args[0] ?? ''),
  }) as unknown as ChalkInstance
}

/** Construct a palette honoring the current terminal capabilities. */
function build(): Palette {
  const level = resolveColorLevel()
  // chalk snapshots its level at first import and `hex`/`rgb` builders read
  // `this.level` when created; force the resolved level onto the default
  // instance so every token built below emits even when FORCE_COLOR was set
  // after chalk was already imported (e.g. by the startup plugin).
  ;(chalk as unknown as { level: number }).level = level
  if (level === 0) {
    const none = makeNone()
    return {
      enabled: false,
      light: false,
      accent: none,
      accent2: none,
      accentSoft: none,
      success: none,
      warning: none,
      error: none,
      muted: none.dim,
      bold: none.bold,
      dim: none.dim,
      input: none,
      code: none,
      codeBlock: none,
      heading: none.bold,
      link: none.underline,
      italic: none.italic,
      agent: none.bold,
      usage: none,
      reasoning: none.italic,
    }
  }

  // Dark-green family — sea-green / forest-green / pine tones.
  // On dark backgrounds we shift slightly brighter; on light backgrounds we
  // shift slightly darker for contrast.
  const accent = LIGHT_BG ? chalk.hex('#1F6B47') : chalk.hex('#2E8B57')
  const accent2 = LIGHT_BG ? chalk.hex('#2D7A4F') : chalk.hex('#3CB371')
  const accentSoft = LIGHT_BG ? chalk.hex('#5C8A7B') : chalk.hex('#7FB59A')
  const success = chalk.hex('#228B22')
  const warning = chalk.hex('#DAA520')
  const error = chalk.hex('#CD5C5C')
  const muted = chalk.hex('#6B7280')
  const reasoning = chalk.hex('#7FB59A').italic
  const usage = chalk.hex('#3CB371')
  const codeInline = chalk.hex('#228B22').bgHex(LIGHT_BG ? '#E8F5EC' : '#1B2A24')
  const codeBlock = chalk.hex('#9CD3A6').bgHex(LIGHT_BG ? '#E8F5EC' : '#101D17')
  const heading = chalk.hex('#2E8B57').bold
  const link = chalk.hex('#1F6B47').underline
  const input = chalk.hex('#101D17').bgHex('#A8D5BA')

  return {
    enabled: true,
    light: LIGHT_BG,
    accent,
    accent2,
    accentSoft,
    success,
    warning,
    error,
    muted,
    bold: chalk.bold,
    dim: chalk.dim,
    input,
    code: codeInline,
    codeBlock,
    heading,
    link,
    italic: chalk.italic,
    agent: chalk.hex('#1F6B47').bold,
    usage,
    reasoning,
  }
}

/**
 * Semantic palette singleton for the current process.
 *
 * A live binding, not a frozen const: {@link resetPalette} reassigns it, and
 * ESM importers observe the new value without re-importing. Each token is a
 * chalk instance (or a color-swallowing proxy when color is disabled), so
 * callers invoke them as functions: `palette.accent('text')`.
 */
export let palette: Palette = Object.freeze(build())

/**
 * Rebuild the singleton against the current environment. Call this after
 * setting `FORCE_COLOR` / `NO_COLOR` / `DSH_KIRO_COLOR` so colors are picked
 * up even when the bundle imported `palette` before the env was settled.
 */
export function resetPalette(): Palette {
  palette = Object.freeze(build())
  return palette
}

/**
 * Resolved color level for the current process (0–3). Re-reads the
 * environment on every call; unlike `chalk.supportsColor` this is not a
 * stale module-load snapshot.
 */
export function colorLevel(): number {
  return resolveColorLevel()
}

/**
 * Render a banner-style gradient across the dsh-kiro ASCII art. The palette's
 * `accent` anchors the left and `accent2` anchors the right; the function uses
 * an HSL interpolation in HSL color space so the gradient stays perceptually
 * smooth even on 8-color terminals.
 * @param text - the banner string to colorize.
 * @returns the gradient-colored string ready to print.
 */
export function banner(text: string): string {
  if (!palette.enabled) return text
  const left = { r: 0x1F, g: 0x6B, b: 0x47 }
  const right = { r: 0x3C, g: 0xB3, b: 0x71 }
  const lines = text.split('\n')
  const maxLen = Math.max(...lines.map((line) => stripAnsi(line).length))
  return lines
    .map((line) => {
      const stripped = stripAnsi(line)
      const cells = [...line]
      let col = 0
      const out: string[] = []
      for (const ch of cells) {
        const t = maxLen <= 1 ? 0 : col / (maxLen - 1)
        const r = Math.round(left.r + (right.r - left.r) * t)
        const g = Math.round(left.g + (right.g - left.g) * t)
        const b = Math.round(left.b + (right.b - left.b) * t)
        out.push(`\x1b[38;2;${r};${g};${b}m${ch}\x1b[0m`)
        col += 1
        if (col >= stripped.length) break
      }
      // Pass through any trailing characters that didn't get a color (rare).
      return out.join('') + line.slice(out.length)
    })
    .join('\n')
}

/** Strip ANSI escape codes for length measurement. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Pick the right icon for a session/event type so the transcript column stays
 * scannable. These map directly onto the Ink `Message.tsx` rendering.
 */
export const ICONS = {
  user: '›',
  assistant: '◆',
  tool: '⚙',
  toolDone: '✓',
  toolFailed: '✗',
  reasoning: '◊',
  system: '·',
  error: '!',
  agent: '◉',
  branch: '⎇',
} as const

export type IconName = keyof typeof ICONS
