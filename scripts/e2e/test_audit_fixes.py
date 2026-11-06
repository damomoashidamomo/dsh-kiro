"""
Audit-fix regressions — bugs found by the full command-surface audit:

- /agent swap on a definition whose JSON top level is not an object crashed;
- /agent create --prompt hello treated the flag VALUE as the agent name;
- uppercase /HELP fell through parseCommand's [a-z] regex and reached the
  MODEL as a prompt;
- /knowledge show <ref> ignored the ref and printed the overview (the real
  detail command, view, was not in the catalog);
- the Ctrl+K all-commands menu submitted bare commands straight to the
  runtime, bypassing the option-picker interception hand-typing gets.
"""

import os
import unittest

from harness import Tui
from screen import Screen


class SwapBrokenFileTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.tui.drain(1.5)
        cls.bad = os.path.expanduser('~/.kiro/agents/audit-broken.json')
        os.makedirs(os.path.dirname(cls.bad), exist_ok=True)
        with open(cls.bad, 'w', encoding='utf-8') as fh:
            fh.write('null')

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.bad):
            os.remove(cls.bad)
        cls.tui.quit()

    def tearDown(self):
        if os.path.exists(self.bad):
            os.remove(self.bad)

    def test_10_swap_reports_instead_of_crashing(self):
        self.tui.type('/agent swap audit-broken', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(1.8)
        visible = self.tui.visible()
        self.assertIn('不是有效的 agent 定义', visible, 'non-object JSON must produce a clean error')


class CreateFlagValueTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.tui.drain(1.5)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_create_does_not_name_the_agent_after_a_flag_value(self):
        self.tui.type('/agent create --prompt hello', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(1.8)
        self.assertIn('usage: /agent create', self.tui.visible())
        self.assertFalse(os.path.exists(os.path.expanduser('~/.kiro/agents/hello.json')),
                         'the flag value must not become an agent named hello')


class UppercaseDispatchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.tui.drain(1.5)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_uppercase_help_dispatches(self):
        self.tui.type('/HELP', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(2.5)
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        joined = '\n'.join(screen.rows())
        self.assertIn('/experiment', joined, '/HELP must render the help text, not reach the model')


class KnowledgeShowDelegatesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.tui.drain(1.5)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_show_with_ref_behaves_as_view(self):
        self.tui.type('/knowledge show 99', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(1.8)
        visible = self.tui.visible()
        self.assertIn('未找到条目', visible, 'show <ref> must resolve the ref like view does')
        self.assertNotIn('knowledge base:', visible, 'the overview must not replace the detail view')


class SlashMenuInterceptionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=36)
        cls.tui.drain(1.5)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_ctrl_k_menu_respects_the_picker(self):
        # Ctrl+K opens the fuzzy all-commands menu; /chat must open the
        # session-menu picker, not silently run the bare list.
        self.tui.write(b'\x0b')
        self.tui.drain(0.8)
        self.tui.type('/chat', delay=0.03)
        self.tui.drain(0.5)
        self.tui.write(b'\r')
        self.tui.drain(2.0)
        screen = Screen(110, 36)
        screen.feed(self.tui.raw)
        self.assertTrue(any('会话管理' in row for row in screen.rows()),
                        'the all-commands menu must open the subcommand picker for /chat')


if __name__ == '__main__':
    unittest.main()
