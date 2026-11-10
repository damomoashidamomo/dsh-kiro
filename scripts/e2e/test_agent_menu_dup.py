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


class AgentListShowsCurrentTest(unittest.TestCase):
    """`/agent list` 必须标注当前激活的 agent（◀ 当前 + 标题里的 当前：X）。"""

    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        ws_dir = os.path.join(cls.tui.tmp, '.dsh-kiro', 'agents')
        os.makedirs(ws_dir, exist_ok=True)
        with open(os.path.join(ws_dir, AGENT + '.json'), 'w', encoding='utf-8') as fh:
            json.dump({'name': AGENT, 'description': '两处同名', 'prompt': 'x', 'tools': ['*'], 'model': None}, fh, ensure_ascii=False)
        cls.tui.drain(1.0)
        cls.tui.type('/agent list', delay=0.02)
        cls.tui.drain(0.4)
        cls.tui.write(b'\r')
        cls.tui.drain(2.0)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_header_and_marker(self):
        visible = self.tui.visible()
        # 未套用预设 → 当前=default，列表里没有叫 default 的行，所以无标记
        self.assertIn('（当前：default）', visible)
        # swap 之后再 list：该行必须带 ◀ 当前
        self.tui.type(f'/agent swap {AGENT}', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(3.0)
        self.tui.type('/agent list', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(2.0)
        visible2 = self.tui.visible()
        self.assertIn(f'（当前：{AGENT}）', visible2, 'swap 后标题要显示当前 agent')
        self.assertIn(f'{AGENT} ◀ 当前', visible2, '对应行必须带 ◀ 当前 标记')
        # 状态栏方括号同样要跟着换（0.7.4 之前 swap 后一直停留在 [default]）
        self.assertIn(f'[{AGENT}] ·', visible2, '状态栏标签必须反映 swap 后的 agent')

if __name__ == '__main__':
    unittest.main()
