"""
Idle/steady-state E2E — the no-flicker contract. A settled TUI must write
ZERO bytes: Ink's live region used to be erased and rewritten on every
timer tick, shaking the whole screen.
"""

import unittest

from harness import Tui


class IdleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui()

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_idle_writes_zero_bytes(self):
        self.tui.drain(1.0)
        total, erases = self.tui.sample(3.0)
        self.assertEqual(total, 0, f'idle wrote {total} bytes / 3s (flicker regression)')
        self.assertEqual(erases, 0)

    def test_typing_keeps_live_region_small(self):
        # Typing rewrites the frame, but only a bounded region: a few dozen
        # erase ops per keystroke burst — never the whole transcript.
        self.tui.type('abcdef')
        self.tui.drain(0.6)
        _, erases = self.tui.sample(1.0)
        self.assertLessEqual(erases, 30, 'typing produced an unbounded redraw')


if __name__ == '__main__':
    unittest.main()
