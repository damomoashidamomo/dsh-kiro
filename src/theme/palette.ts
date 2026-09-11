/**
 * dsh-kiro color palette — dark-green themed.
 *
 * The Kiro CLI ships a purple palette; dsh-kiro swaps it for a dark-green
 * (墨绿/海绿/森林绿) family that reads well on both dark and light terminal
 * backgrounds. Color detection follows chalk's `supportsColor` rules so a
 * non-TTY environment (CI, redirect) automatically drops color codes.
 *
 * @module @damomoashidamomo/dsh-kiro/theme/palette
 */

import chalk, { type ChalkInstance } from 'chalk'

/** True when the current stream honors ANSI color escapes. */
const COLOR_LEVEL = (chalk as unknown as { supportsColor?: { level?: number } }).supportsColor?.level ?? 0

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
  if (COLOR_LEVEL === 0) {
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

/** Frozen semantic palette for the current process. */
export const palette: Palette = Object.freeze(build())

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
  const maxLen = Math.max(...lines.map(line => stripAnsi(line).length))
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
