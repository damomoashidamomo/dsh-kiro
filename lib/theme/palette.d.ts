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
import { type ChalkInstance } from 'chalk';
/** Semantic palette token. */
export interface Palette {
    /** Whether the palette emits color at all. */
    readonly enabled: boolean;
    /** Whether the detected terminal background is light. */
    readonly light: boolean;
    /** Primary brand accent — banner, logo, selected state, key bindings. */
    readonly accent: ChalkInstance;
    /** Secondary accent — sub-headings, secondary highlights. */
    readonly accent2: ChalkInstance;
    /** Soft accent — hints, secondary copy. */
    readonly accentSoft: ChalkInstance;
    /** Success / completion — green shift for finished tool calls. */
    readonly success: ChalkInstance;
    /** Warning — gold. */
    readonly warning: ChalkInstance;
    /** Error — muted red that stays legible on both backgrounds. */
    readonly error: ChalkInstance;
    /** Muted text — timestamps, metadata, hints. */
    readonly muted: ChalkInstance;
    /** Plain bold — strong emphasis without color. */
    readonly bold: ChalkInstance;
    /** Dim — separators, brackets, secondary structure. */
    readonly dim: ChalkInstance;
    /** Reverse-video — user input lines. */
    readonly input: ChalkInstance;
    /** Inline code style. */
    readonly code: ChalkInstance;
    /** Code block style. */
    readonly codeBlock: ChalkInstance;
    /** Heading style. */
    readonly heading: ChalkInstance;
    /** Link style. */
    readonly link: ChalkInstance;
    /** Italic style. */
    readonly italic: ChalkInstance;
    /** Bold + accent — agent name. */
    readonly agent: ChalkInstance;
    /** Token usage bar fill. */
    readonly usage: ChalkInstance;
    /** Reasoning-text tint. */
    readonly reasoning: ChalkInstance;
}
/**
 * Semantic palette singleton for the current process.
 *
 * A live binding, not a frozen const: {@link resetPalette} reassigns it, and
 * ESM importers observe the new value without re-importing. Each token is a
 * chalk instance (or a color-swallowing proxy when color is disabled), so
 * callers invoke them as functions: `palette.accent('text')`.
 */
export declare let palette: Palette;
/**
 * Rebuild the singleton against the current environment. Call this after
 * setting `FORCE_COLOR` / `NO_COLOR` / `DSH_KIRO_COLOR` so colors are picked
 * up even when the bundle imported `palette` before the env was settled.
 */
export declare function resetPalette(): Palette;
/**
 * Resolved color level for the current process (0–3). Re-reads the
 * environment on every call; unlike `chalk.supportsColor` this is not a
 * stale module-load snapshot.
 */
export declare function colorLevel(): number;
/**
 * Render a banner-style gradient across the dsh-kiro ASCII art. The palette's
 * `accent` anchors the left and `accent2` anchors the right; the function uses
 * an HSL interpolation in HSL color space so the gradient stays perceptually
 * smooth even on 8-color terminals.
 * @param text - the banner string to colorize.
 * @returns the gradient-colored string ready to print.
 */
export declare function banner(text: string): string;
/**
 * Pick the right icon for a session/event type so the transcript column stays
 * scannable. These map directly onto the Ink `Message.tsx` rendering.
 */
export declare const ICONS: {
    readonly user: "›";
    readonly assistant: "◆";
    readonly tool: "⚙";
    readonly toolDone: "✓";
    readonly toolFailed: "✗";
    readonly reasoning: "◊";
    readonly system: "·";
    readonly error: "!";
    readonly agent: "◉";
    readonly branch: "⎇";
};
export type IconName = keyof typeof ICONS;
