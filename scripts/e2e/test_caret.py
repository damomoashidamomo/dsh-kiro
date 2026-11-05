"""
Caret positioning E2E — the real terminal cursor must sit at the logical
caret. Regression for the displayWidth-counted-ANSI bug (caret clamped to
line end under truecolor) and the ink log-update jump mechanics.

The prompt gutter is `0% > ` when the boot model declares a context window,
but a bare `> ` when the model has no declared window (no invented default).
These tests therefore DERIVE the gutter width from the rendered prompt line
instead of hardcoding it — otherwise the suite silently rots whenever the
user switches the default model.
"""

import re
import time
import unicodedata
import unittest

from harness import Tui

SGR_RE = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]')
OSC_RE = re.compile(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)')


def visible_width(text: str) -> int:
    """Terminal columns of `text` with ANSI stripped and CJK counted as 2."""
    text = OSC_RE.sub('', SGR_RE.sub('', text))
    return sum(2 if unicodedata.east_asian_width(ch) in ('W', 'F') else 1 for ch in text)


def _prompt_line(tui: Tui) -> str:
    """The live frame's LAST non-empty line — the prompt row."""
    frame = tui.last_frame()
    for line in reversed(frame.split('\n')):
        if line.strip() != '':
            return line
    raise AssertionError(f'no prompt line in last frame: {frame[-400:]!r}')


def prompt_gutter(tui: Tui) -> str:
    """Rendered gutter text: everything up to and including the `> ` marker."""
    line = _prompt_line(tui)
    visible = OSC_RE.sub('', SGR_RE.sub('', line))
    marker = '> ' if '> ' in visible else '! '
    idx = visible.find(marker)
    if idx < 0:
        raise AssertionError(f'prompt line has no gutter marker: {visible!r}')
    return visible[:idx + len(marker)]


class CaretTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui()

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def gutter(self) -> int:
        """Visible width of the gutter the frame actually rendered."""
        width = visible_width(prompt_gutter(self.tui))
        self.assertGreater(width, 0)
        return width

    def caret(self) -> int:
        col = self.tui.caret_col()
        self.assertIsNotNone(col, 'no caret jump found in output')
        return col  # type: ignore[return-value]

    def test_10_idle_caret_after_gutter(self):
        # The caret parks right after the `> ` (or `0% > `) gutter.
        self.tui.drain(1.0)
        gutter = self.gutter()
        self.assertEqual(self.caret(), gutter, 'idle caret not parked after the gutter')

    def test_20_caret_follows_typing(self):
        self.tui.type('hello')
        self.tui.drain(0.6)
        self.assertEqual(self.caret(), self.gutter() + 5)

    def test_30_left_arrow_moves_two_cols(self):
        self.tui.left(1)
        self.tui.drain(0.6)
        self.assertEqual(self.caret(), self.gutter() + 4)

    def test_40_mid_text_insert_keeps_caret(self):
        self.tui.write('X')
        self.tui.drain(0.6)
        # One LEFT then insert: 'hellX|o' — cursor 5 after the X.
        # The point: the caret follows the insertion point, not the line end
        # ('hellXo' is 6 chars; end would be gutter+6).
        self.assertIn('hellXo', self.tui.last_frame())
        self.assertEqual(self.caret(), self.gutter() + 5)
        self.assertNotEqual(self.caret(), self.gutter() + 6)

    def test_50_home_goes_to_draft_start(self):
        self.tui.write(b'\x1b[H')
        ok = self.tui.wait_for_frame_change()
        self.assertTrue(ok)
        self.assertEqual(self.caret(), self.gutter())

    def test_60_cjk_caret_columns(self):
        for _ in range(20):
            self.tui.write(b'\x7f')
        self.tui.drain(0.5)
        self.tui.type('这是一段', delay=0.12)
        self.tui.drain(0.8)
        # 4 CJK chars x 2 columns per char.
        self.assertEqual(self.caret(), self.gutter() + 8)
        self.tui.left(1)
        self.tui.drain(0.6)
        self.assertEqual(self.caret(), self.gutter() + 6)


# helper attached to Tui via duck-typing to keep the harness minimal
def _wait_for_frame_change(self: Tui, timeout: float = 2.0) -> bool:
    start = len(self.buf)
    deadline = time.time() + timeout
    while time.time() < deadline:
        self.drain(0.05)
        if len(self.buf) > start:
            return True
    return False


Tui.wait_for_frame_change = _wait_for_frame_change  # type: ignore[attr-defined]

if __name__ == '__main__':
    unittest.main()
