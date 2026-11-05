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
import unittest

from harness import Tui

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


if __name__ == '__main__':
    unittest.main()
