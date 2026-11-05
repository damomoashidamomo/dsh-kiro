"""Minimal terminal emulator: replay a byte stream into a screen grid."""
import re, unicodedata

def cw(ch):
    return 2 if unicodedata.east_asian_width(ch) in ('W', 'F') else 1

class Screen:
    def __init__(self, cols, rows):
        self.cols, self.height = cols, rows
        self.grid = [[' '] * cols]
        self.col = self.row = 0
        self.pending = False
    def _ensure(self, r):
        while len(self.grid) <= r:
            self.grid.append([' '] * self.cols)
    def _put(self, ch, w):
        if self.pending or self.col + w > self.cols:
            self.row += 1; self.col = 0; self.pending = False; self._ensure(self.row)
        line = self.grid[self.row]
        for i in range(w):
            if self.col + i < self.cols:
                line[self.col + i] = ch if i == 0 else ''
        self.col += w
        if self.col >= self.cols:
            self.col = self.cols; self.pending = True
    def feed(self, data):
        i = 0
        n = len(data)
        while i < n:
            ch = data[i]
            if ch == '\x1b':
                m = re.match(r'\x1b\[([0-9;?]*)([A-Za-z])', data[i:])
                if m:
                    raw = m.group(1)
                    try:
                        cnt = int(raw.split(';')[0] or 1) if not raw.startswith('?') else 1
                    except ValueError:
                        cnt = 1
                    k = m.group(2)
                    if k == 'A': self.row = max(0, self.row - cnt); self.pending = False
                    elif k == 'B': self.row += cnt; self._ensure(self.row); self.pending = False
                    elif k == 'C': self.col = min(self.cols - 1, self.col + cnt); self.pending = False
                    elif k == 'D': self.col = max(0, self.col - cnt); self.pending = False
                    elif k == 'K':
                        start = 0 if raw == '2' else self.col
                        line = self.grid[self.row]
                        for x in range(start, self.cols): line[x] = ' '
                    elif k == 'J':
                        self.grid = [[' '] * self.cols]; self.row = self.col = 0
                    elif k == 'H': self.row = self.col = 0
                    i += len(m.group(0)); continue
                m = re.match(r'\x1b\]8;;[^\x1b]*(?:\x1b\\|\x07)', data[i:])
                if m: i += len(m.group(0)); continue
                i += 1; continue
            if ch == '\r': self.col = 0; self.pending = False; i += 1; continue
            if ch == '\n':
                self.row += 1; self.col = 0; self.pending = False; self._ensure(self.row)
                i += 1; continue
            w = cw(ch)
            if w: self._put(ch, w)
            i += 1
    def rows(self):
        return [''.join(r).rstrip() for r in self.grid]
