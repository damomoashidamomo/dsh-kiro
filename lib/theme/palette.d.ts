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
/** Frozen semantic palette for the current process. */
export declare const palette: Palette;
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
