"""
kiro-cli parity E2E: double-press exit + `/chat save` / `/chat load`.

Measured on kiro-cli 1.27.0 in a PTY:
- idle, one Ctrl+C (or Ctrl+D) prints
  "(To exit the CLI, press Ctrl+C or Ctrl+D again or type /quit)" and STAYS,
  a second press exits — even 12 s later, the arming does not time out;
- `/chat save <PATH>` exports the session state, `/chat load <PATH>` restores
  it, and both demand a PATH (usage error otherwise).
"""

import json
import os
import shutil
import unittest

from harness import Tui
from screen import Screen


class DoublePressExitTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=100, lines=30)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def _rows(self):
        screen = Screen(100, 30)
        screen.feed(self.tui.raw)
        return [row for row in screen.rows() if row.strip()]

    def test_10_first_ctrl_c_only_hints(self):
        self.tui.write(b'\x03')
        self.tui.drain(1.5)
        joined = '\n'.join(self._rows())
        self.assertIn('press Ctrl+C or Ctrl+D again or type /quit', joined)
        self.assertIn('再按一次 Ctrl+C 或 Ctrl+D 退出', joined)
        self.assertFalse(self.tui.dead, 'a single Ctrl+C must not exit')

    def test_20_second_ctrl_c_exits(self):
        self.tui.write(b'\x03')
        self.tui.drain(2.0)
        self.assertTrue(self.tui.dead, 'a second Ctrl+C must exit')


class SaveLoadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.out = os.path.join(cls.tui.tmp, 'saved')
        os.makedirs(cls.out, exist_ok=True)
        cls.path = os.path.join(cls.out, 'session.json')

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_save_requires_a_path(self):
        self.tui.write('/chat save\r')
        self.assertTrue(self.tui.wait_for('required arguments were not provided', 20))
        self.tui.drain(0.8)
        self.assertIn('Usage: /chat save <PATH>', self.tui.visible())

    def test_20_save_writes_a_self_contained_export(self):
        self.tui.write('/help\r')
        self.tui.drain(1.5)
        self.tui.write(f'/chat save {self.path}\r')
        self.assertTrue(self.tui.wait_for('已导出会话状态', 25), 'no export confirmation')
        self.tui.drain(1.0)
        with open(self.path, encoding='utf-8') as handle:
            doc = json.load(handle)
        self.assertEqual(doc['format'], 'dsh-kiro/session-export@1')
        self.assertTrue(doc['events'], 'the export carries the decoded log')
        self.assertEqual(doc['events'][0]['type'], 'session')
        self.assertEqual(doc['session']['cwd'], self.tui.tmp)

    def test_30_save_refuses_to_clobber_without_force(self):
        self.tui.write(f'/chat save {self.path}\r')
        self.assertTrue(self.tui.wait_for('文件已存在', 20), 'no --force refusal')
        self.tui.drain(0.6)
        self.assertIn('--force', self.tui.visible())

    def test_40_load_restores_and_switches(self):
        self.tui.write(f'/chat load {self.path} --no-continue\r')
        self.assertTrue(self.tui.wait_for('恢复会话', 25), 'no load confirmation')
        self.tui.drain(1.5)
        visible = self.tui.visible()
        self.assertIn('已恢复会话 session-', visible)
        # Same cwd, so the exported id is taken: a fresh id is minted instead of
        # duplicating an id across project dirs (that breaks the platform store).
        self.assertIn('已存在，改用新 id', visible)

    def test_50_restored_session_is_listed(self):
        self.tui.write('/chat list\r')
        self.tui.drain(2.5)
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        listed = [row for row in screen.rows() if 'session-' in row]
        self.assertGreaterEqual(len(listed), 2, 'the restored session must show up in the listing')


if __name__ == '__main__':
    unittest.main()
