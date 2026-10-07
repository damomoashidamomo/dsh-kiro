#!/usr/bin/env python3
"""
dsh-kiro pixel logo generator — Kiro ghost + DeepSeek whale.

Draws the mark in code (no image model): PIL primitives on a small true-pixel
canvas, fixed palette, hand-defined pixel fonts, Bayer-4x4 ordered dithering
for gradients. One master design (220x120) is painted at three scales so any
terminal width gets the largest art that fits:

    220x120  -> 220 cols x 60 rows   (very wide terminals)
    165x90   -> 165 cols x 45 rows
    110x60   -> 110 cols x 30 rows   (standard 120-col terminal)

Emits:
  assets/logo-preview.png   master x6 (nearest) for out-of-terminal viewing
  src/theme/logo-ansi.ts    LOGO_VARIANTS + sizes

Run:  python3 tools/logo.py
"""

from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Design-space variant sizes: (width, height, scale).
VARIANTS = [(220, 120, 1.0), (165, 90, 0.75), (110, 60, 0.5)]

# ----------------------------------------------------------------------------
# Fixed palette (truecolor).
# ----------------------------------------------------------------------------
PAL = {
    'bg':      (13, 17, 23),    # #0d1117 terminal charcoal
    'outline': (6, 10, 18),     # near-black outline
    'sky':     (11, 22, 38),    # deep night sky
    'skyGlow': (20, 44, 66),    # teal sky glow
    'sea':     (13, 32, 52),    # sea body
    'seaLit':  (28, 74, 94),    # wave crest teal
    'whale':   (47, 111, 228),  # deepseek blue
    'whaleHi': (82, 148, 255),  # whale top light
    'whaleDk': (26, 66, 158),   # whale bottom shade
    'belly':   (159, 192, 232), # pale belly
    'bellyDk': (108, 144, 196),
    'ghost':   (242, 248, 255), # ghost white
    'ghostSh': (195, 212, 232), # ghost shading
    'ghostDk': (138, 162, 192), # ghost deep shade
    'eye':     (10, 16, 32),
    'white':   (255, 255, 255),
    'green':   (63, 222, 118),  # phosphor green
    'greenHi': (170, 255, 200),
    'amber':   (240, 190, 90),
    'cyan':    (56, 190, 200),
    'star':    (110, 200, 190),
    'starHi':  (200, 250, 246),
    'teal':    (32, 86, 92),    # border
    'tealHi':  (64, 132, 124),
    'pink':    (255, 138, 168), # ghost blush
}

BAYER = [[0.000, 0.500, 0.125, 0.625],
         [0.750, 0.250, 0.875, 0.375],
         [0.188, 0.688, 0.063, 0.563],
         [0.938, 0.438, 0.813, 0.313]]


def bayer(x, y):
    return BAYER[y % 4][x % 4]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


# ----------------------------------------------------------------------------
# Hand-defined pixel fonts.
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


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGB', (w, h), PAL['bg'])
        self.d = ImageDraw.Draw(self.img)

    def px(self, x, y, key):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.img.putpixel((x, y), PAL[key])

    def px_rgb(self, x, y, rgb):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.img.putpixel((x, y), rgb)

    def get(self, x, y):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.img.getpixel((x, y))
        return PAL['bg']


def draw_variant(w, h, s):
    c = Canvas(w, h)

    # ------------------------------------------------------------------ sky
    cx, cy = w * 0.5, h * 0.42
    for y in range(h):
        for x in range(w):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            t = max(0.0, 1.0 - dist / (w * 0.42))
            base = lerp(PAL['sky'], PAL['bg'], (y / h) * 0.6)
            if t > 0 and bayer(x, y) < t * 0.55:
                c.px_rgb(x, y, lerp(base, PAL['skyGlow'], t * 0.8))
            else:
                c.px_rgb(x, y, base)

    # ---------------------------------------------------------------- stars
    stars = [(10, 12, 1), (30, 30, 0), (52, 8, 0), (86, 16, 1), (120, 26, 0),
             (150, 10, 1), (176, 30, 0), (198, 14, 1), (208, 40, 0), (16, 52, 0),
             (96, 44, 0), (204, 58, 0), (66, 22, 0), (140, 34, 0)]
    for sx, sy, bright in stars:
        x, y = int(sx * s), int(sy * s)
        c.px(x, y, 'starHi' if bright else 'star')
        if bright and s >= 0.75:
            for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                c.px(x + dx, y + dy, 'star')

    # ------------------------------------------------------------------ sea
    sea_y = int(h * 0.66)
    for y in range(sea_y, h):
        for x in range(w):
            depth = (y - sea_y) / max(1, h - sea_y)
            c.px_rgb(x, y, lerp(PAL['seaLit'], PAL['sea'], min(1, depth * 1.6)))
    for i in range(3):
        wy = sea_y + int(i * 4 * s) + 1
        for x in range(w):
            if bayer(x, wy) < 0.45:
                c.px(x, wy, 'seaLit')
    for wx, wy in [(18, 4), (60, 10), (120, 6), (170, 9), (95, 13), (205, 3)]:
        x0, y0 = int(wx * s), sea_y + int(wy * s)
        c.px(x0, y0, 'cyan'); c.px(x0 - 1, y0, 'cyan'); c.px(x0 + 1, y0, 'cyan')
        c.px(x0, y0 - 1, 'cyan')

    # ----------------------------------------------------------- deepseek whale
    def W_(x): return x * s
    def H_(y): return y * s

    body_top, body_bot = H_(46), H_(92)
    head_x, tail_x = W_(66), W_(196)
    pts = [
        (head_x, H_(58)), (head_x + 14 * s, body_top), (head_x + 60 * s, H_(42)),
        (tail_x - 10 * s, H_(50)), (tail_x, H_(62)),
        (tail_x - 12 * s, H_(78)), (head_x + 62 * s, body_bot),
        (head_x + 16 * s, H_(97)), (head_x, H_(78)),
    ]
    c.d.polygon(pts, fill=PAL['whale'])
    hi = [(head_x + 16 * s, body_top + 2 * s), (head_x + 60 * s, H_(44)),
          (tail_x - 12 * s, H_(52)), (tail_x - 10 * s, H_(55)),
          (head_x + 60 * s, H_(51)), (head_x + 16 * s, body_top + 8 * s)]
    c.d.polygon(hi, fill=PAL['whaleHi'])
    sh = [(head_x, H_(64)), (head_x + 14 * s, H_(92)), (head_x + 60 * s, body_bot),
          (tail_x - 12 * s, H_(76)), (tail_x - 14 * s, H_(70)),
          (head_x + 60 * s, H_(84)), (head_x + 14 * s, H_(84)), (head_x, H_(74))]
    c.d.polygon(sh, fill=PAL['whaleDk'])

    c.d.polygon([(tail_x - 2 * s, H_(58)), (tail_x + 10 * s, H_(40)),
                 (tail_x + 4 * s, H_(60))], fill=PAL['whale'])
    c.d.polygon([(tail_x - 2 * s, H_(64)), (tail_x + 10 * s, H_(80)),
                 (tail_x + 4 * s, H_(62))], fill=PAL['whaleDk'])

    for i in range(4):
        bx = head_x + (16 + i * 11) * s
        c.d.line([(bx, H_(80 + i * 2)), (bx + 3 * s, H_(94 - i * 3))],
                 fill=PAL['bellyDk'], width=max(1, int(s)))
    c.d.polygon([(head_x + 4 * s, H_(70)), (head_x + 30 * s, H_(95)),
                 (head_x + 50 * s, H_(88)), (head_x + 8 * s, H_(90))],
                fill=PAL['belly'])

    ex, ey = head_x + 16 * s, H_(60)
    er = max(1, int(2.2 * s))
    c.d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=PAL['eye'])
    c.px(ex - 1 * s, ey - 1 * s, 'white')
    c.d.arc([head_x + 4 * s, H_(60), head_x + 34 * s, H_(80)],
            start=15, end=55, fill=PAL['eye'], width=max(1, int(s)))
    if s >= 0.75:
        c.px(head_x + 24 * s, H_(70), 'pink')

    c.d.polygon([(head_x + 40 * s, H_(84)), (head_x + 52 * s, H_(98)),
                 (head_x + 56 * s, H_(80))], fill=PAL['whaleDk'])

    spx = head_x + 46 * s
    c.px(spx, body_top - 1 * s, 'cyan')
    for i, (dx, dy) in enumerate([(0, -4), (-2, -7), (2, -8), (-1, -11), (3, -12)]):
        c.px(spx + dx * s, body_top + dy * s, 'cyan' if i % 2 else 'starHi')
    if s >= 0.75:
        c.px(spx - 3 * s, body_top - 9 * s, 'cyan')
        c.px(spx + 4 * s, body_top - 10 * s, 'starHi')

    # ------------------------------------------------------------- kiro ghost
    gx0, gy0 = W_(14), H_(30)
    gw, gh = 40 * s, 46 * s
    gx1, gy1 = gx0 + gw, gy0 + gh
    c.d.pieslice([gx0, gy0, gx1, gy0 + gw], 180, 360, fill=PAL['ghost'])
    c.d.rectangle([gx0, gy0 + gw / 2, gx1, gy1 - 4 * s], fill=PAL['ghost'])
    c.d.rectangle([gx0, gy0 + gw / 2, gx0 + 4 * s, gy1 - 4 * s], fill=PAL['ghostSh'])
    c.d.rectangle([gx1 - 3 * s, gy0 + gw * 0.3, gx1, gy1 - 4 * s], fill=PAL['ghostSh'])
    bites = 3
    for i in range(bites):
        bx = gx0 + (i + 0.5) * (gw / bites)
        r = gw / bites / 2
        c.d.pieslice([bx - r, gy1 - 4 * s - r, bx + r, gy1 - 4 * s + r],
                     0, 180, fill=PAL['bg'])
    for x in range(int(gx0), int(gx1)):
        y = gy1 - 5 * s
        if c.get(x, int(y)) == PAL['ghost'] or c.get(x, int(y)) == PAL['ghostSh']:
            c.px(x, y, 'ghostDk')
    for exo in (0.32, 0.62):
        exx = gx0 + gw * exo
        eyy = gy0 + gh * 0.38
        er = max(1, int(2.4 * s))
        c.d.ellipse([exx - er, eyy - er * 1.3, exx + er, eyy + er * 1.3], fill=PAL['eye'])
        c.px(exx, eyy - 1 * s, 'white')
    mx, my = gx0 + gw * 0.47, gy0 + gh * 0.55
    c.d.ellipse([mx - 2 * s, my, mx + 3 * s, my + 3 * s], fill=PAL['eye'])
    if s >= 0.75:
        c.px(mx + 0.5 * s, my + 0.5 * s, 'pink')
        c.px(gx0 + gw * 0.2, gy0 + gh * 0.52, 'pink')
        c.px(gx1 - gw * 0.24, gy0 + gh * 0.52, 'pink')
    c.d.polygon([(gx1 - 1 * s, gy0 + gh * 0.55), (gx1 + 5 * s, gy0 + gh * 0.42),
                 (gx1 + 4 * s, gy0 + gh * 0.58)], fill=PAL['ghostSh'])
    ty = gy0 + gh * 0.74
    for i in range(3):
        c.px(gx0 + gw * 0.3 + i * s, ty + i * s, 'green')
        c.px(gx0 + gw * 0.3 + i * s, ty + (2 - i) * s + 2 * s, 'green')
    for i in range(4):
        c.px(gx0 + gw * 0.44 + i * s, ty + 4 * s, 'greenHi')
    gcx, gcy = gx0 + gw / 2, gy0 + gh / 2
    for y in range(int(gy0) - 2, int(gy1) + 2):
        for x in range(int(gx0) - 2, int(gx1) + 2):
            cur = c.get(x, y)
            if cur in (PAL['bg'], PAL['sky']):
                rx = (x - gcx) / (gw * 0.62)
                ry = (y - gcy) / (gh * 0.62)
                rr = (rx * rx + ry * ry) ** 0.5
                if 0.9 < rr < 1.35 and bayer(x, y) < 0.4:
                    c.px_rgb(x, y, lerp(cur, PAL['green'], 0.22))

    # ------------------------------------------------------- wordmark + tagline
    text = 'DSH-KIRO'
    fw, fh, gap = 6, 7, 1
    total = len(text) * (fw + gap) - gap
    tx = (w - total) // 2
    ty = int(h * 0.83)
    glyph_px = []
    for ch in text:
        glyph = FONT6[ch]
        for yy in range(fh):
            for xx in range(fw):
                if glyph[yy][xx] == '#':
                    c.px(tx + xx, ty + yy, 'green')
                    glyph_px.append((tx + xx, ty + yy))
        tx += fw + gap
    for y in range(ty - 2, ty + fh + 2):
        for x in range(w):
            if c.get(x, y) != PAL['green']:
                near = min(((x - sx) ** 2 + (y - sy) ** 2) ** 0.5 for sx, sy in glyph_px)
                t = max(0.0, 1.0 - near / 3.4)
                if t > 0 and bayer(x, y) < t * 0.32:
                    cur = c.get(x, y)
                    c.px_rgb(x, y, lerp(cur, PAL['green'], 0.3))
    for y in range(ty, ty + fh):
        for x in range(w):
            if c.get(x, y) == PAL['green'] and (y == ty or c.get(x, y - 1) != PAL['green']):
                if bayer(x, y) < 0.6:
                    c.px_rgb(x, y, lerp(PAL['green'], PAL['greenHi'], 0.65))

    def draw3(st, ty_, key):
        tx_ = (w - (len(st) * 4 - 1)) // 2
        for ch in st:
            glyph = FONT3[ch]
            for yy in range(5):
                for xx in range(3):
                    if glyph[yy][xx] == '#':
                        c.px(tx_ + xx, ty_ + yy, key)
            tx_ += 4
    draw3('KIRO CLI · DEEPSEEK HARNESS', int(h * 0.925), 'belly')

    # ------------------------------------------------------------ border + vignette
    for x in range(w):
        if 3 <= x < w - 3:
            c.px(x, 0, 'teal'); c.px(x, h - 1, 'teal')
    for y in range(h):
        if 3 <= y < h - 3:
            c.px(0, y, 'teal'); c.px(w - 1, y, 'teal')
    for x0, y0 in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]:
        c.px(x0, y0, 'tealHi')
    c.px(1, 3, 'teal'); c.px(3, 1, 'teal')
    c.px(w - 2, 3, 'teal'); c.px(w - 4, 1, 'teal')
    c.px(1, h - 4, 'teal'); c.px(3, h - 2, 'teal')
    c.px(w - 2, h - 4, 'teal'); c.px(w - 4, h - 2, 'teal')

    for y in range(h):
        for x in range(w):
            edge = min(x, y, w - 1 - x, h - 1 - y)
            if edge <= 1:
                t = (2 - edge) / 2.0
                if bayer(x, y) < t * 0.45:
                    cur = c.get(x, y)
                    if cur != PAL['green']:
                        c.px_rgb(x, y, lerp(cur, PAL['bg'], 0.5))
    return c.img


def to_ansi(img):
    w, h = img.size
    def fg(c2): return f'\x1b[38;2;{c2[0]};{c2[1]};{c2[2]}m'
    def bg(c2): return f'\x1b[48;2;{c2[0]};{c2[1]};{c2[2]}m'
    out = []
    for y in range(0, h, 2):
        parts, last_fg, last_bg = [], None, None
        for x in range(w):
            top = img.getpixel((x, y))
            bot = img.getpixel((x, y + 1))
            if top == bot:
                if last_bg != top:
                    parts.append(bg(top)); last_bg = top
                parts.append(' ')
            else:
                if last_fg != top:
                    parts.append(fg(top)); last_fg = top
                if last_bg != bot:
                    parts.append(bg(bot)); last_bg = bot
                parts.append('▀')
        out.append(''.join(parts) + '\x1b[0m')
    return '\n'.join(out)


def to_ts_string(s):
    out = s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    return f'`{out}`'


def main():
    preview = None
    blocks = []
    for w, h, s in VARIANTS:
        img = draw_variant(w, h, s)
        ansi = to_ansi(img)
        blocks.append((w, ansi))
        if s == 1.0:
            preview = img
    assert preview is not None
    out_png = ROOT / 'assets' / 'logo-preview.png'
    out_png.parent.mkdir(exist_ok=True)
    preview.resize((preview.width * 6, preview.height * 6), Image.NEAREST).save(out_png)

    entries = ',\n  '.join(
        f'{{ cols: {w}, ansi: {to_ts_string(a)} }}' for w, a in blocks
    )
    ts = ROOT / 'src' / 'theme' / 'logo-ansi.ts'
    ts.write_text(
        '/**\n'
        ' * dsh-kiro pixel logo, generated by tools/logo.py — do not hand-edit.\n'
        ' * Kiro ghost + DeepSeek whale, painted in code on true-pixel canvases\n'
        ' * (fixed palette, pixel fonts, Bayer dithering) and packed to truecolor\n'
        ' * half-block ANSI (upper-pixel fg + lower-pixel bg). Largest variant\n'
        ' * that fits the terminal wins; callers fall back to ASCII otherwise.\n'
        ' *\n'
        ' * @module @damomoashidamomo/dsh-kiro/theme/logo-ansi\n'
        ' */\n'
        '\n'
        'export interface LogoVariant {\n'
        '  readonly cols: number\n'
        '  readonly ansi: string\n'
        '}\n'
        '\n'
        '/** Variants sorted widest-first. */\n'
        f'export const LOGO_VARIANTS: readonly LogoVariant[] = [\n  {entries},\n]\n',
        encoding='utf-8')
    print(f'wrote {out_png} and {ts}')
    for w, a in blocks:
        print(f'  variant {w} cols -> {len(a)} ansi chars')


if __name__ == '__main__':
    main()
