"""
/agent picker with the same agent defined in BOTH scopes.

Regression: after 0.7.0's migration the workspace and the user root can each
hold a copy of the same agent. The picker used to render both rows (React
duplicate-key warning: "Encountered two children with the same key"), which
ink surfaces as an error block in the transcript. Contract now:

- the menu lists the agent ONCE (workspace copy wins — findAgent prefers it);
- the raw byte stream contains NO duplicate-key warning.
"""

import json
import os
import unittest

from harness import Tui
from screen import Screen

AGENT = 'dup-agent'


class AgentMenuDuplicateScopeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        body = {'name': AGENT, 'description': '两处同名', 'prompt': 'x', 'tools': ['*'], 'model': None}
        # workspace scope …
        ws_dir = os.path.join(cls.tui.tmp, '.dsh-kiro', 'agents')
        os.makedirs(ws_dir, exist_ok=True)
        with open(os.path.join(ws_dir, AGENT + '.json'), 'w', encoding='utf-8') as fh:
            json.dump(body, fh, ensure_ascii=False)
        # … and the identical user scope (hermetic home, so no real dir is touched)
        user_dir = os.path.join(cls.tui.home, '.dsh-kiro', 'agents')
        os.makedirs(user_dir, exist_ok=True)
        with open(os.path.join(user_dir, AGENT + '.json'), 'w', encoding='utf-8') as fh:
            json.dump(dict(body), fh, ensure_ascii=False)
        cls.tui.drain(1.0)
        cls.tui.type('/agent', delay=0.02)
        cls.tui.drain(0.4)
        cls.tui.write(b'\r')
        cls.tui.drain(2.0)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_no_react_duplicate_key_warning(self):
        self.assertNotIn('same key', self.tui.raw, 'ink must not warn about duplicate React keys')

    def test_20_agent_listed_exactly_once(self):
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        rows = [row for row in screen.rows() if row.strip().startswith(('▸', '│', ' ')) and AGENT in row]
        # one menu row (plus possibly the transcript echo of the command) — but
        # never two menu entries for the same name
        menu_rows = [row for row in rows if '（回车直接切换）' in row or '两处同名' in row]
        self.assertEqual(len(menu_rows), 1, f'expected exactly one menu row, got: {menu_rows}')

    def test_30_swap_still_reaches_the_workspace_copy(self):
        self.tui.write(b'\x1b')
        self.tui.drain(0.8)
        self.tui.type(f'/agent swap {AGENT}', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        ok = self.tui.wait_for('引擎', 10) or self.tui.wait_for(AGENT, 6)
        self.tui.drain(1.0)
        visible = self.tui.visible()
        self.assertTrue(ok or AGENT in visible, 'swap must still work for the deduped agent')
        self.assertNotIn('no agent named', visible)


if __name__ == '__main__':
    unittest.main()
