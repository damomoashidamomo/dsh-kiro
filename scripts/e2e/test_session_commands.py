"""
Session management E2E — /chat new switches sessions in place, the '/'
autocomplete popup keeps matching while args are typed, and /paste
list/clean manage spill files. None of these need a model call.
"""

import os
import unittest

from harness import Tui


class SessionCommandTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui()

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_slash_popup_matches_with_args(self):
        # The old bug: typing args after the command name (`/chat resume`)
        # fuzzy-searched the WHOLE query and showed "no commands match".
        self.tui.write('/chat resume')
        self.tui.drain(1.0)
        recent = self.tui.raw[-1400:]
        self.assertNotIn('no commands match', recent)
        # backspace the draft away for the following tests
        for _ in range(30):
            self.tui.write(b'\x7f')
        self.tui.drain(0.5)

    def test_20_chat_new_switches_in_place(self):
        self.tui.write('/chat new\r')
        self.assertTrue(self.tui.wait_for('已开启新会话', 30), 'no fresh-session banner')

    def test_30_resume_without_id_prints_usage(self):
        """/chat resume with no id hints at usage instead of re-listing sessions.

        It used to print the five most recent sessions, duplicating the table
        `/chat list` already shows; the hint now points at both ways to pick one.
        """
        self.tui.write('/chat resume\r')
        self.assertTrue(self.tui.wait_for('/chat resume <session-id>', 20), 'no usage hint')
        self.tui.drain(1.0)
        visible = self.tui.visible()
        self.assertIn('在当前 TUI 内直接切换', visible)
        self.assertIn('/chat list', visible)


class PasteCommandTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui()
        paste_dir = os.path.join(cls.tui.tmp, '.kiro', 'paste')
        os.makedirs(paste_dir, exist_ok=True)
        with open(os.path.join(paste_dir, 'paste-20250101120000.txt'), 'w') as fh:
            fh.write('hello paste 1')
        with open(os.path.join(paste_dir, 'paste-20250102130000.txt'), 'w') as fh:
            fh.write('x' * 2048)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_list_shows_files(self):
        self.tui.write('/paste list\r')
        self.assertTrue(self.tui.wait_for('落盘粘贴文件（2', 20))
        self.tui.drain(0.8)
        visible = self.tui.visible()
        self.assertIn('2.0 KB', visible)

    def test_20_clean_removes_all(self):
        self.tui.write('/paste clean\r')
        self.assertTrue(self.tui.wait_for('已删除 2/2', 20))
        self.assertFalse(os.path.exists(os.path.join(self.tui.tmp, '.kiro', 'paste')))


if __name__ == '__main__':
    unittest.main()
