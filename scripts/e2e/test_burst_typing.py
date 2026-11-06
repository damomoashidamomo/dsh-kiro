"""
Burst typing — `/agent` + Enter typed as ONE burst right after a typo.

The reported bug: the popup commit path decided from App-level prefix/query
state, which updates via a useEffect and lags a fast-typed draft. A stale
query got submitted instead of the real draft (`Unknown command: /agnet` when
the user typed `/agent`). The commit now reads the live draft text.
"""

import unittest

from harness import Tui
from screen import Screen


class BurstTypingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.tui.drain(1.5)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_burst_command_after_typo_opens_the_picker(self):
        # Plant the stale query: typo + Enter (honest Unknown command).
        self.tui.type('/agnet', delay=0.02)
        self.tui.drain(0.5)
        self.tui.write(b'\r')
        self.tui.drain(1.5)
        self.assertIn('Unknown command: /agnet', self.tui.visible())
        # `/agent` + Enter as ONE burst — the stale query must not be submitted.
        self.tui.write(b'/agent\r')
        self.tui.drain(2.0)
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        self.assertTrue(any('自定义 agent' in row for row in screen.rows()),
                        'the burst-typed /agent must open the picker, not submit the stale query')
        self.tui.write(b'\x1b')
        self.tui.drain(0.8)

    def test_20_burst_chat_opens_the_session_menu(self):
        self.tui.write(b'/chat\r')
        self.tui.drain(2.0)
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        self.assertTrue(any('会话管理' in row for row in screen.rows()),
                        'a burst-typed /chat must open the session menu')
        self.tui.write(b'\x1b')
        self.tui.drain(0.8)

    def test_30_burst_typo_is_honest(self):
        self.tui.write(b'/xyzzy\r')
        self.tui.drain(1.5)
        visible = self.tui.visible()
        self.assertIn('Unknown command: /xyzzy', visible)
        self.assertIn('Type a message', visible, 'the draft must be cleared after an unknown command')


if __name__ == '__main__':
    unittest.main()
