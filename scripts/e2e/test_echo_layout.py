"""
Echo layout E2E — the prompt echo must sit directly above the prompt.

kiro-cli prints its identity once (`Model: auto`) and has no permanent status
bar, so an echoed `N% >` line lands immediately above the input. The bar here
used to be pinned between them (echoes, bar, prompt), which read as "the echo
went to the wrong place".
"""
import re
import unittest

from harness import Tui
from screen import Screen

SGR_RE = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]')
GUTTER_RE = re.compile(r'^\s*\d+% >\s*$')
PROMPT_RE = re.compile(r'^\s*\d+% > .+$|^\s*> .+$')


class EchoLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=100, lines=30)
        cls.tui.drain(1.5)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def screen_rows(self):
        """The true terminal screen: the byte stream replayed into a model.

        Raw-byte counts are useless here — every frame repaint re-sends the
        same text — so the assertions look at what the terminal would SHOW.
        """
        screen = Screen(100, 30)
        screen.feed(self.tui.raw)
        return screen.rows()

    def test_10_boot_line_is_printed_once(self):
        rows = self.screen_rows()
        hits = [row for row in rows if '工作区:' in row]
        self.assertEqual(len(hits), 1, f'identity line duplicated on screen: {hits}')

    def test_20_no_status_bar_at_idle(self):
        rows = self.screen_rows()
        self.assertFalse(any('· idle' in row for row in rows), 'the status bar should stay hidden at idle')

    def test_30_echo_sits_directly_above_the_prompt(self):
        self.tui.write(b'\r')
        self.tui.drain(0.8)
        rows = [row for row in self.screen_rows() if row.strip() != '']
        prompt_index = next((i for i in range(len(rows) - 1, -1, -1) if PROMPT_RE.match(rows[i])), None)
        self.assertIsNotNone(prompt_index, f'no prompt row in frame: {rows}')
        above = rows[prompt_index - 1] if prompt_index > 0 else ''
        self.assertRegex(above, GUTTER_RE, f'row above the prompt is not an echo gutter: {rows}')
        # And no status bar snuck in between.
        self.assertFalse(any('· idle' in row for row in rows), 'status bar between echo and prompt')


if __name__ == '__main__':
    unittest.main()
