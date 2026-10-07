/**
 * dsh-kiro startup banner. ASCII art: Hatsune Miku holding the Kiro ghost
 * (left) and the DeepSeek whale (right), with the CLI wordmark beneath.
 * Stored unpadded (max line <= 78 cols, safe for 80-column terminals);
 * the transcript centers it. `banner()` applies the green gradient.
 *
 * @module @damomoashidamomo/dsh-kiro/theme/banner
 */

export const BANNER = String.raw`
  ✦                      /~~~~                     ~~~~\                   ✦
                      //     ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄   \\
                    //       █~‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾~█    \\     ~
              ✧   //         █     ◕       ◕      █       \\   ~
         ~▄▄▄▄▄▄//           █          ‿         █         ▄▄▄▄▄▄▄▄~~
          █o   o█            █   |  ▽      ▽   |  █        ▐  •    ▐≈≈
       ~~ █     █       \    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  /     ▀▀▀▀▀▀▀▀   ~~
          ▀≈≈≈≈≈≈▀  \              |   |                 /     \\
            // (o)                \   /                      (o)
                                  \ /
    ✧                                                                    ✧

                                    Kiro CLI · DeepSeek Harness
`


import { LOGO_ANSI } from './logo-ansi'
import { banner, colorLevel } from './palette'

/**
 * The startup mark for TUI surfaces: the truecolor pixel logo when the
 * terminal speaks 24-bit color (level 3), else the classic ASCII banner.
 * The pixel art embeds raw `38;2`/`48;2` sequences, so level 2 (256-color)
 * falls back rather than risking mis-rendered ANSI.
 */
export function splashMark(): string {
  return colorLevel() >= 3 ? LOGO_ANSI : banner(BANNER)
}
