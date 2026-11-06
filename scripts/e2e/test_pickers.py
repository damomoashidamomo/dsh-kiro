"""
Option-picker E2E — Enter on a bare `/command` must list EVERY subcommand.

Regression for the reported bug: `/chat` + Enter showed only list / a couple of
sessions / new, silently omitting `delete` and `help`, and most other
multi-subcommand commands had no picker at all. The expected rows come from the
shipped catalog (commands/subcommands.ts) so this test tracks the source of
truth instead of a hardcoded copy.
"""

import json
import re
import subprocess
import shutil
import unittest

from fake_sessions import make_sessions
from harness import Tui
from screen import Screen

SGR_RE = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]')

REPO = '/home/gary/deepseek harness work zone/dsh-kiro'


def catalog() -> dict:
    """Load COMMAND_PICKERS from the built lib (same code the TUI runs)."""
    script = (
        "const m = require('" + REPO + "/lib/commands/subcommands.js');"
        "console.log(JSON.stringify(m.COMMAND_PICKERS));"
    )
    out = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def box_rows(text: str) -> list:
    """Rows of the LAST bordered box in the byte stream."""
    plain = SGR_RE.sub('', text)
    boxes = []
    current = None
    for line in plain.splitlines():
        stripped = line.strip()
        if stripped.startswith('╭'):
            current = []
        elif stripped.startswith('╰'):
            if current is not None:
                boxes.append(current)
            current = None
        elif current is not None:
            current.append(stripped.strip('│ ').rstrip())
    return boxes[-1] if boxes else []


class PickerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=40)
        cls.catalog = catalog()
        cls.cache = {}

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def open_picker(self, command: str) -> list:
        if command in self.cache:
            return self.cache[command]
        before = len(self.tui.buf)
        self.tui.type('/' + command, delay=0.02)
        self.tui.drain(0.5)
        self.tui.write(b'\r')
        self.tui.drain(1.0)
        rows = box_rows(self.tui.buf[before:].decode('utf-8', 'replace'))
        self.tui.write(b'\x1b')  # Esc closes the picker
        self.tui.drain(0.5)
        self.cache[command] = rows
        return rows

    def test_00_every_catalog_command_opens_a_picker(self):
        for command in self.catalog:
            rows = self.open_picker(command)
            self.assertTrue(rows, f'/{command} did not open a picker')
            self.assertNotIn('no commands match', rows[0], f'/{command}: popup, not picker')

    def test_10_chat_lists_every_action(self):
        rows = self.open_picker('chat')
        joined = '\n'.join(rows)
        for action in ('list', 'new', 'resume', 'delete', 'help'):
            self.assertIn(action, joined, f'/chat picker is missing `{action}`')
        self.assertIn('会话管理', joined)

    def test_20_every_catalog_row_is_offered(self):
        for command, picker in self.catalog.items():
            rows = self.open_picker(command)
            joined = '\n'.join(rows)
            for row in picker['rows']:
                label = row['value'].split()[0]
                self.assertIn(label, joined, f'/{command} picker is missing `{label}`')

    def test_30_session_rows_show_a_title_or_timestamp(self):
        rows = self.open_picker('chat')
        session_rows = [row for row in rows if re.search(r'\d{4}-\d{2}-\d{2}', row) or '—' in row]
        self.assertTrue(session_rows, 'no session row rendered')
        # Every session row carries either a timestamp or a title — never the
        # old hardcoded `（无简介）`.
        self.assertFalse(any('无简介' in row for row in session_rows))

    def test_40_draft_clears_after_a_command_with_args(self):
        """Enter with args typed is consumed by the popup, not the prompt.

        The popup committed `/chat list` but never cleared the prompt, so the
        next thing typed was appended to it: typing `/chat` afterwards became
        `/chat list/chat` (unknown subcommand) and the resume menu never
        opened. Reported as "/chat list 之后按 /chat 不弹菜单了".
        """
        fresh = Tui(columns=110, lines=40)
        try:
            fresh.drain(1.5)
            fresh.type('/chat list', delay=0.02)
            fresh.drain(0.4)
            fresh.write(b'\r')
            fresh.drain(1.4)
            screen = Screen(110, 40)
            screen.feed(fresh.raw)
            prompt = [row for row in screen.rows() if '% >' in row]
            self.assertRegex(
                prompt[-1] if prompt else '',
                r'%\s*>\s*(Type a message|$)',
                'the draft was not cleared after a command with arguments',
            )
            # And the picker still opens afterwards (the reported symptom).
            fresh.type('/chat', delay=0.02)
            fresh.drain(0.4)
            fresh.write(b'\r')
            fresh.drain(1.2)
            screen2 = Screen(110, 40)
            screen2.feed(fresh.raw)
            joined = '\n'.join(screen2.rows())
            self.assertIn('会话管理', joined, 'the /chat picker did not open after a command with args')
            self.assertIn('resume', joined)
        finally:
            fresh.quit()

    def test_50_session_rows_carry_a_title(self):
        """Every session row shows a 简介 (title or first user message).

        Reported twice: rows only ever showed a timestamp. The platform's
        session query returned nothing for these logs — its persistence listing
        refuses to load the whole store once one session id appears in two
        project dirs — so titles now come from the log file directly. This
        drives the real path: two fabricated sessions in the workspace's source
        dir, one with a durable title, one whose first user message stands in.
        """
        fresh = Tui(columns=110, lines=40)
        made = []
        try:
            fresh.drain(1.5)
            made = make_sessions(fresh.tmp, [
                {'id': 'session-fake1111-0000-0000-0000-000000000000',
                 'title': '重构登录流程', 'firstUser': '帮我重构登录流程'},
                {'id': 'session-fake2222-0000-0000-0000-000000000000',
                 'firstUser': '这条会话没有标题,只有首条消息'},
            ])
            fresh.type('/chat', delay=0.02)
            fresh.drain(0.4)
            fresh.write(b'\r')
            fresh.drain(2.5)
            screen = Screen(110, 40)
            screen.feed(fresh.raw)
            joined = '\n'.join(screen.rows())
            self.assertIn('重构登录流程', joined, 'the durable session title never reached the menu')
            self.assertIn('这条会话没有标题', joined, 'the first-user-message fallback never reached the menu')
        finally:
            for path in made:
                shutil.rmtree(path, ignore_errors=True)
            fresh.quit()


if __name__ == '__main__':
    unittest.main()
