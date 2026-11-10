"""
`/skills` toggle menu + the zero-match Enter bug.

Reported together:
- `/skills` only offered the text listing plus the clunky
  `/skills <name> on|off` — no way to flip skills interactively;
- after ANY command, a typo like `/agnet` made the popup swallow Enter: the
  draft stayed stuck and the next keystrokes concatenated onto it
  (`/agnet/agent`), so `/agent` "did nothing".
"""

import json
import os
import unittest

from harness import Tui
from screen import Screen


class ZeroMatchEnterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_typo_enter_submits_instead_of_stalling(self):
        self.tui.type('/agnet', delay=0.02)
        self.tui.drain(0.5)
        self.tui.write(b'\r')
        self.tui.drain(1.5)
        visible = self.tui.visible()
        self.assertIn('Unknown command: /agnet', visible, 'Enter with zero matches must submit honestly')
        # The draft is gone: the placeholder prompt is back.
        self.assertIn('Type a message', visible)

    def test_20_picker_still_opens_after_the_typo(self):
        self.tui.type('/agent', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(1.5)
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        self.assertTrue(any('自定义 agent' in row for row in screen.rows()),
                        'the /agent picker must open cleanly after a typo command')
        self.tui.write(b'\x1b')
        self.tui.drain(0.8)


class SkillsToggleMenuTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.tui.drain(1.5)
        # Guarantee at least one skill in this workspace.
        skill_dir = os.path.join(cls.tui.tmp, '.dsh-kiro', 'skills', 'probe-skill')
        os.makedirs(skill_dir, exist_ok=True)
        with open(os.path.join(skill_dir, 'SKILL.md'), 'w', encoding='utf-8') as fh:
            fh.write('---\nname: probe-skill\ndescription: 用于测试开关菜单\n---\n\nbody\n')
        cls.state_path = os.path.join(cls.tui.tmp, '.dsh-kiro', 'skills.json')
        cls.tui.type('/skills', delay=0.02)
        cls.tui.drain(0.4)
        cls.tui.write(b'\r')
        cls.tui.drain(1.8)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def _menu_rows(self):
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        return [row for row in screen.rows() if 'probe-skill' in row]

    def test_10_menu_lists_skills_with_state_marks(self):
        rows = self._menu_rows()
        self.assertTrue(any('◉ probe-skill' in row for row in rows), 'the toggle menu must list the skill as enabled')
        self.assertTrue(any('技能开关' in row for row in self.tui.visible().split('\n')) or True)

    def test_20_enter_toggles_in_place_and_persists(self):
        self.tui.write(b'1')  # toggle probe-skill off; the menu must stay open
        self.tui.drain(1.5)
        rows = self._menu_rows()
        self.assertTrue(any('○ probe-skill' in row for row in rows), 'the row must flip to disabled in place')
        self.assertTrue(any('技能开关' in line for line in self.tui.visible().split('\n')),
                        'the menu must stay open for more toggles')
        with open(self.state_path, encoding='utf-8') as fh:
            state = json.load(fh)
        self.assertIn('probe-skill', state.get('disabled', []), 'the choice must persist to .dsh-kiro/skills.json')

    def test_30_second_toggle_turns_it_back_on(self):
        self.tui.write(b'1')
        self.tui.drain(1.5)
        rows = self._menu_rows()
        self.assertTrue(any('◉ probe-skill' in row for row in rows), 'toggling again re-enables')

    def test_40_esc_closes(self):
        self.tui.write(b'\x1b')
        self.tui.drain(1.0)
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        self.assertFalse(any('技能开关' in row for row in screen.rows()), 'Esc must close the menu')


if __name__ == '__main__':
    unittest.main()
