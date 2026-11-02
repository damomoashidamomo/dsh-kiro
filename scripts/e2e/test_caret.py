"""
Caret positioning E2E — the real terminal cursor must sit at the logical
caret. Regression for the displayWidth-counted-ANSI bug (caret clamped to
line end under truecolor) and the ink log-update jump mechanics.
"""

import unittest

from harness import Tui


class CaretTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui()

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_idle_caret_after_gutter(self):
        # `0% > ` gutter is 5 visible columns even with truecolor SGR bytes.
        self.tui.drain(1.0)
        col = self.tui.caret_col()
        self.assertEqual(col, 5, f'idle caret col {col} != 5 (gutter width)')

    def test_20_caret_follows_typing(self):
        self.tui.type('hello')
        self.tui.drain(0.6)
        self.assertEqual(self.tui.caret_col(), 10)

    def test_30_left_arrow_moves_two_cols(self):
        self.tui.left(1)
        self.tui.drain(0.6)
        self.assertEqual(self.tui.caret_col(), 9)

    def test_40_mid_text_insert_keeps_caret(self):
        self.tui.write('X')
        self.tui.drain(0.6)
        # One LEFT then insert: 'hellX|o' — cursor 5 after the X → col 10.
        # The point: the caret follows the insertion point, not the line end
        # ('hellXo' is 6 chars; end would be col 11).
        self.assertIn('hellXo', self.tui.last_frame())
        self.assertEqual(self.tui.caret_col(), 10)
        self.assertNotEqual(self.tui.caret_col(), 11)

    def test_50_home_goes_to_draft_start(self):
        self.tui.write(b'\x1b[H')
        ok = self.tui.wait_for_frame_change()
        self.assertTrue(ok)
        self.assertEqual(self.tui.caret_col(), 5)

    def test_60_cjk_caret_columns(self):
        for _ in range(20):
            self.tui.write(b'\x7f')
        self.tui.drain(0.5)
        self.tui.type('这是一段', delay=0.12)
        self.tui.drain(0.8)
        # gutter 5 + 4 CJK chars x 2 columns = 13.
        self.assertEqual(self.tui.caret_col(), 13)
        self.tui.left(1)
        self.tui.drain(0.6)
        self.assertEqual(self.tui.caret_col(), 11)


# helper attached to Tui via duck-typing to keep the harness minimal
def _wait_for_frame_change(self: Tui, timeout: float = 2.0) -> bool:
    start = len(self.buf)
    deadline = time.time() + timeout
    import time as _t
    while _t.time() < deadline:
        self.drain(0.05)
        if len(self.buf) > start:
            return True
    return False


import time  # noqa: E402
Tui.wait_for_frame_change = _wait_for_frame_change  # type: ignore[attr-defined]

if __name__ == '__main__':
    unittest.main()
