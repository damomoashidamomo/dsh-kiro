/**
 * dsh-kiro startup banner. ASCII art: Hatsune Miku holding the Kiro ghost
 * (left) and the DeepSeek whale (right), with the CLI wordmark beneath.
 * Stored unpadded (max line <= 78 cols, safe for 80-column terminals);
 * the transcript centers it. `banner()` applies the green gradient.
 *
 * @module @damomoashidamomo/dsh-kiro/theme/banner
 */
export declare const BANNER: string;
/**
 * The startup mark for TUI surfaces: the truecolor pixel logo when the
 * terminal speaks 24-bit color (level 3), else the classic ASCII banner.
 * The pixel art embeds raw `38;2`/`48;2` sequences, so level 2 (256-color)
 * falls back rather than risking mis-rendered ANSI. Of the pre-rendered
 * variants (220/165/110 cols) the largest that fits `columns` wins.
 */
export declare function splashMark(columns: number | undefined): string;
