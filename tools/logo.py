#!/usr/bin/env python3
"""
dsh-kiro pixel logo generator.

Draws the mascot + wordmark on a small true-pixel grid (hand-placed palette
indices + hand-defined pixel fonts + Bayer-ordered dithering), then emits:

  1. assets/logo-preview.png  - x16 upscale (crisp nearest-neighbor) for
     human inspection outside the terminal.
  2. src/theme/logo-ansi.ts   - the TUI payload: one truecolor ANSI string
     using Unicode half blocks (upper + background = 2 pixel rows per
     terminal cell, so a 72x44 grid renders 72 cols x 22 rows).

Run:  python3 tools/logo.py
"""

from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

W, H = 72, 48  # pixel canvas (even height -> clean half-block rows)

# ----------------------------------------------------------------------------
# Palette (truecolor). Index chars used in the hand-drawn grids below.
# ----------------------------------------------------------------------------
PAL = {
    'bg': (13, 17, 23),     # #0d1117 terminal charcoal
    'O': (10, 14, 26),      # outline navy
    'n': (18, 30, 52),      # deep navy shadow
    'd': (22, 54, 66),      # dark teal body shadow
    't': (32, 86, 92),      # teal body
    'l': (64, 132, 124),    # light teal highlight
    'b': (94, 156, 138),    # mint belly
    'c': (56, 190, 200),    # cyan visor
    'C': (150, 240, 246),   # bright cyan visor highlight
    'w': (224, 240, 244),   # white
    'a': (196, 138, 46),    # amber beak
    'A': (240, 190, 90),    # bright amber
    'g': (63, 222, 118),    # phosphor green
    'G': (170, 255, 200),   # bright green
    's': (46, 58, 74),      # dim star / glyph
    'S': (110, 200, 190),   # bright star
    'r': (120, 44, 56),     # dark red accent (robot eye scanline)
}

# ----------------------------------------------------------------------------
# Mascot: robot owl, 24x20, symmetric. Draw LEFT half (12 cols), mirror.
# ----------------------------------------------------------------------------
OWL_LEFT = [
    '...OO......g',
    '..OttO.....g',
    '.OtCCO....gg',
    '.OtCCwO...O.',
    'OdtCCCcOOOOtO',
    'OdtCCCCCCCctO',
    'OdtcCcCCCcctO',
    'OdtnccccccntO',
    '.Odn......nO.',
    '.Odn......nO.',
    '.Odnl....lnO.',
    '..Odd....dO..',
    '..OdtOOOOdO..',
    '..OdtbbbtO...',
    '..OdbbbbO....',
    '..OdbbbO.....',
    '...OdbO......',
    '...OdO.......',
    '..Oa..aO.....',
    '.............',
]
# Owl anchor (top-left of the FULL 24-wide sprite) on the canvas:
OWL_X, OWL_Y = (W - 24) // 2, 3

# ----------------------------------------------------------------------------
# Pixel fonts.
# 6x7 wordmark font for "DSH-KIRO".
# ----------------------------------------------------------------------------
FONT6 = {
    'D': ['######', '#.....', '#.....', '#....#', '#....#', '#....#', '######'],
    'S': ['.#####', '#.....', '#.....', '.####.', '.....#', '.....#', '#####.'],
    'H': ['#....#', '#....#', '#....#', '######', '#....#', '#....#', '#....#'],
    'K': ['#....#', '#...#.', '#..#..', '#.#...', '##....', '#.#...', '#..#..'],
    'I': ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
    'R': ['#####.', '#....#', '#....#', '#####.', '#.#...', '#..#..', '#...##'],
    'O': ['.####.', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
    '-': ['......', '......', '......', '######', '......', '......', '......'],
}
# 3x5 tagline font.
FONT3 = {
    'K': ['#.#', '##.', '#.#', '#.#', '#.#'],
    'I': ['###', '.#.', '.#.', '.#.', '###'],
    'R': ['##.', '#.#', '##.', '#.#', '#.#'],
    'O': ['###', '#.#', '#.#', '#.#', '###'],
    'C': ['###', '#..', '#..', '#..', '###'],
    'L': ['#..', '#..', '#..', '#..', '###'],
    'D': ['##.', '#.#', '#.#', '#.#', '##.'],
    'E': ['###', '#..', '##.', '#..', '###'],
    'P': ['###', '#.#', '###', '#..', '#..'],
    'H': ['#.#', '#.#', '###', '#.#', '#.#'],
    'A': ['###', '#.#', '###', '#.#', '#.#'],
    'S': ['###', '#..', '###', '..#', '###'],
    'N': ['###', '###', '###', '#.#', '#.#'],
    '·': ['...', '.#.', '.#.', '...', '...'],
    ' ': ['...', '...', '...', '...', '...'],
}

# ----------------------------------------------------------------------------
# Bayer 4x4 ordered-dither threshold matrix (value in [0,1)).
# ----------------------------------------------------------------------------
BAYER = [[0.000, 0.500, 0.125, 0.625],
         [0.750, 0.250, 0.875, 0.375],
         [0.188, 0.688, 0.063, 0.563],
         [0.938, 0.438, 0.813, 0.313]]


def bayer(x: int, y: int) -> float:
    return BAYER[y % 4][x % 4]


def lerp(a, b, t: float):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def main() -> None:
    grid = {}
    for y in range(H):
        for x in range(W):
            grid[(x, y)] = PAL['bg']

    def put(x, y, key):
        if 0 <= x < W and 0 <= y < H:
            grid[(x, y)] = PAL[key]

    # --- background: subtle radial teal glow behind the mascot ---------------
    cx, cy = W / 2, 14
    for y in range(H):
        for x in range(W):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            t = max(0.0, 1.0 - dist / 30.0)
            if t > 0 and bayer(x, y) < t * 0.45:
                grid[(x, y)] = lerp(PAL['bg'], PAL['n'], 0.6)

    # --- badge border: rounded rect, teal, with corner notches ---------------
    def rounded_border():
        for x in range(W):
            for y in (0, H - 1):
                if 3 <= x < W - 3:
                    put(x, y, 't')
        for y in range(H):
            for x in (0, W - 1):
                if 3 <= y < H - 3:
                    put(x, y, 't')
        # corners
        for i, (cx0, cy0) in enumerate([(2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3)]):
            put(cx0, cy0, 'l')
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            x, y = (2 + dx, 2 + dy) if dx >= 0 and dy >= 0 else (0, 0)
        # simple corner arcs
        put(1, 3, 't'); put(3, 1, 't'); put(W - 2, 3, 't'); put(W - 4, 1, 't')
        put(1, H - 4, 't'); put(3, H - 2, 't'); put(W - 2, H - 4, 't'); put(W - 4, H - 2, 't')

    rounded_border()

    # --- scattered pixel stars & terminal glyphs ------------------------------
    stars = [(6, 8, 'S'), (14, 5, 's'), (62, 7, 'S'), (54, 4, 's'),
             (5, 30, 's'), (66, 28, 'S'), (10, 38, 's'), (61, 39, 'S'), (68, 12, 's')]
    for x, y, k in stars:
        put(x, y, k)
        # sparkle cross on the bright ones
        if k == 'S':
            for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                px, py = x + dx, y + dy
                if 0 <= px < W and 0 <= py < H and grid[(px, py)] == PAL['bg']:
                    grid[(px, py)] = lerp(PAL['bg'], PAL[k], 0.45)

    # tiny '{ }' glyph pixels flanking the owl
    for i, (gx, gy) in enumerate([(16, 24), (55, 24)]):
        pat = ['#.#', '.#.', '#.#'] if i == 0 else ['#.#', '.#.', '#.#']
        for yy, row in enumerate(pat):
            for xx, ch in enumerate(row):
                if ch == '#':
                    put(gx + xx, gy + yy, 's')

    # --- mascot ---------------------------------------------------------------
    half = [row.ljust(12, '.')[:12] for row in OWL_LEFT]
    for row in half:
        assert len(row) == 12, row
    for yy, left in enumerate(half):
        full = left + left[::-1]
        for xx, ch in enumerate(full):
            if ch != '.':
                put(OWL_X + xx, OWL_Y + yy, ch)
    # beak: replace the visor-bottom center with amber (symmetric)
    for bx in range(OWL_X + 10, OWL_X + 14):
        for by in (OWL_Y + 8,):
            put(bx, by, 'a')
    put(OWL_X + 11, OWL_Y + 8, 'A')
    put(OWL_X + 12, OWL_Y + 8, 'A')

    # --- wordmark: "DSH-KIRO", phosphor green with dithered glow -------------
    text = 'DSH-KIRO'
    fw, fh, gap = 6, 7, 1
    total = len(text) * (fw + gap) - gap
    tx = (W - total) // 2
    ty = 27
    for ch in text:
        glyph = FONT6[ch]
        for yy in range(fh):
            for xx in range(fw):
                if glyph[yy][xx] == '#':
                    put(tx + xx, ty + yy, 'g')
        tx += fw + gap
    # glow: dilate green into bg with dither falloff
    glow_src = [(x, y) for y in range(ty - 1, ty + fh + 1)
                for x in range(W) if grid[(x, y)] == PAL['g']]
    for y in range(ty - 2, ty + fh + 3):
        for x in range(W):
            near = min(((x - sx) ** 2 + (y - sy) ** 2) ** 0.5 for sx, sy in glow_src) \
                if glow_src else 99
            t = max(0.0, 1.0 - near / 3.2)
            cur = grid[(x, y)]
            if cur in (PAL['bg'],) or (cur != PAL['g'] and lerp_dist(cur, PAL['n']) < 8):
                if bayer(x, y) < t * 0.30:
                    grid[(x, y)] = lerp(cur, PAL['g'], 0.35)
    # brighten the top edge of each glyph stroke (phosphor shine)
    for y in range(ty, ty + fh):
        for x in range(W):
            if grid[(x, y)] == PAL['g'] and (y == ty or grid[(x, y - 1)] != PAL['g']):
                if bayer(x, y) < 0.55:
                    grid[(x, y)] = lerp(PAL['g'], PAL['G'], 0.6)

    # --- tagline: two stacked lines, mint, tiny font --------------------------
    def draw3(s, ty_, key):
        tx_ = (W - (len(s) * 4 - 1)) // 2
        for ch in s:
            glyph = FONT3[ch]
            for yy in range(5):
                for xx in range(3):
                    if glyph[yy][xx] == '#':
                        put(tx_ + xx, ty_ + yy, key)
            tx_ += 4
    draw3('KIRO CLI', 35, 'b')
    draw3('DEEPSEEK HARNESS', 35 + 6, 'b')

    # --- CRT vignette: dither-darken the outer ring ---------------------------
    for y in range(H):
        for x in range(W):
            edge = min(x, y, W - 1 - x, H - 1 - y)
            if edge <= 2:
                t = (3 - edge) / 3.0
                if bayer(x, y) < t * 0.5:
                    cur = grid[(x, y)]
                    if cur != PAL['g']:
                        grid[(x, y)] = lerp(cur, PAL['bg'], 0.55)

    # --------------------------------------------------------------------------
    # Emit 1: PNG preview (x16 nearest-neighbor).
    # --------------------------------------------------------------------------
    img = Image.new('RGB', (W, H))
    for y in range(H):
        for x in range(W):
            img.putpixel((x, y), grid[(x, y)])
    scale = 16
    big = img.resize((W * scale, H * scale), Image.NEAREST)
    out_png = ROOT / 'assets' / 'logo-preview.png'
    out_png.parent.mkdir(exist_ok=True)
    big.save(out_png)

    # --------------------------------------------------------------------------
    # Emit 2: ANSI half-block string (truecolor).
    # --------------------------------------------------------------------------
    def fg(c):
        return f'\x1b[38;2;{c[0]};{c[1]};{c[2]}m'

    def bg(c):
        return f'\x1b[48;2;{c[0]};{c[1]};{c[2]}m'

    RESET = '\x1b[0m'
    lines = []
    for y in range(0, H, 2):
        parts = []
        last_fg = last_bg = None
        for x in range(W):
            top = grid[(x, y)]
            bot = grid[(x, y + 1)]
            if top == bot:
                # solid cell: use background fill + space
                if last_bg != top:
                    parts.append(bg(top)); last_bg = top
                parts.append(' ')
            else:
                if last_fg != top:
                    parts.append(fg(top)); last_fg = top
                if last_bg != bot:
                    parts.append(bg(bot)); last_bg = bot
                parts.append('▀')
        lines.append(''.join(parts) + RESET)
    ansi = '\n'.join(lines)

    ts = ROOT / 'src' / 'theme' / 'logo-ansi.ts'
    ts.write_text(
        '/**\n'
        ' * dsh-kiro pixel logo, generated by tools/logo.py — do not hand-edit.\n'
        ' * Truecolor ANSI half-block art (72x44 px -> 72 cols x 22 rows).\n'
        ' * Requires color level >= 2 (truecolor); callers fall back to the\n'
        ' * ASCII banner otherwise.\n'
        ' *\n'
        ' * @module @damomoashidamomo/dsh-kiro/theme/logo-ansi\n'
        ' */\n'
        '\n'
        'export const LOGO_ANSI = ' + to_ts_string(ansi) + '\n', encoding='utf-8')
    print(f'wrote {out_png} ({big.size[0]}x{big.size[1]})')
    print(f'wrote {ts} ({len(ansi)} chars ansi)')


def lerp_dist(a, b):
    return sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5


def to_ts_string(s: str) -> str:
    """Encode as a TS template literal, escaping backticks and ${."""
    out = s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    return f'`{out}`'


if __name__ == '__main__':
    main()
