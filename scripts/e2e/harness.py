"""
Shared PTY harness for dsh-kiro end-to-end tests.

Boots the REAL TUI (`dsh --profile kiro`) in a pseudo-terminal inside a
throwaway /tmp workspace, feeds it keystrokes, and asserts on the RAW byte
stream — cursor-positioning sequences, OSC 8 envelopes, erase traffic —
none of which are observable from unit tests.

Ground rules:
- Every workspace lives under /tmp (never touch other directories).
- The kiro PROFILE must be freshly deployed before running (`pnpm add
  file:…` in the profile) — these tests exercise the installed build.
- Colors are FORCED ON (COLORTERM=truecolor, FORCE_COLOR=3): several past
  bugs (displayWidth counting ANSI bytes) only reproduced with truecolor
  SGR present; a colorless harness silently passed them.

Usage from a test::

    from harness import Tui
    class TestFoo(unittest.TestCase):
        @classmethod
        def setUpClass(cls):
            cls.tui = Tui()
        @classmethod
        def tearDownClass(cls):
            cls.tui.quit()
        def test_x(self):
            self.tui.type('hello')
            ...
"""

from __future__ import annotations

import fcntl
import os
import pty
import re
import select
import shutil
import struct
import termios
import time

ERASE_RE = re.compile(rb'\x1b\[2K|\x1b\[1A')
SGR_RE = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]')
OSC_RE = re.compile(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)')


class Tui:
    """One booted TUI session bound to a fresh /tmp workspace."""

    def __init__(self, columns: int = 100, lines: int = 30, boot_timeout: float = 90.0):
        self.tmp = f'/tmp/kiro-e2e-{os.getpid()}-{int(time.time() * 1000) % 100000}'
        shutil.rmtree(self.tmp, ignore_errors=True)
        os.makedirs(self.tmp)
        self.env = os.environ.copy()
        self.env['TERM'] = 'xterm-256color'
        # Force truecolor so styled gutters carry real SGR bytes — the
        # displayWidth-counted-ANSI bug passed every colorless run.
        self.env['COLORTERM'] = 'truecolor'
        self.env['FORCE_COLOR'] = '3'
        self.env['COLUMNS'] = str(columns)
        self.env['LINES'] = str(lines)
        self.columns = columns
        self.buf = b''
        self.dead = False

        self.pid, self.fd = pty.fork()
        if self.pid == 0:  # child
            os.chdir(self.tmp)
            os.execvpe('dsh', ['dsh', '--profile', 'kiro'], self.env)

        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', lines, columns, 0, 0))
        if not self.wait_for('Type a message', boot_timeout):
            raise AssertionError('TUI did not boot (no prompt marker in output)')
        self.drain(1.0)

    # -- low level ---------------------------------------------------------

    def drain(self, secs: float = 0.3) -> None:
        """Read whatever arrives within `secs` into the buffer."""
        end = time.time() + secs
        while time.time() < end:
            ready, _, _ = select.select([self.fd], [], [], 0.05)
            if ready:
                try:
                    chunk = os.read(self.fd, 65536)
                except OSError:
                    self.dead = True
                    return
                if not chunk:
                    self.dead = True
                    return
                self.buf += chunk

    def wait_for(self, pattern: str, timeout: float) -> bool:
        """Drain until `pattern` (plain substring) appears; False on timeout."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.drain(0.05)
            if pattern in self.buf.decode('utf-8', 'replace'):
                return True
        return False

    def write(self, data: bytes | str) -> None:
        if isinstance(data, str):
            data = data.encode('utf-8')
        os.write(self.fd, data)

    def type(self, text: str, delay: float = 0.08) -> None:
        """Type text one character at a time (real keystroke cadence)."""
        for ch in text:
            self.write(ch)
            time.sleep(delay)

    def enter(self) -> None:
        self.write(b'\r')

    def left(self, count: int = 1, delay: float = 0.4) -> None:
        for _ in range(count):
            self.write(b'\x1b[D')
            time.sleep(delay)

    # -- observation -------------------------------------------------------

    @property
    def raw(self) -> str:
        return self.buf.decode('utf-8', 'replace')

    def sample(self, secs: float) -> tuple[int, int]:
        """Bytes written and erase-line sequences observed over a window."""
        start = len(self.buf)
        self.drain(secs)
        chunk = self.buf[start:]
        return len(chunk), len(ERASE_RE.findall(chunk))

    def visible(self) -> str:
        """Buffer with SGR/OSC escapes stripped (readable transcript text)."""
        text = OSC_RE.sub('', SGR_RE.sub('', self.raw))
        return text

    def last_frame(self) -> str:
        """Text after the final line-erase — the current live region write."""
        parts = [p for p in re.split(r'\x1b\[2K', self.raw) if p.strip()]
        return parts[-1] if parts else ''

    def last_caret_jump(self) -> re.Match | None:
        """The final caret positioning jump (CR · CUF… · show-cursor)."""
        return re.search(r'\r(?:\x1b\[\d+A)?\x1b\[\d+C\x1b\[\?25h[^\r]*$', self.raw)

    def caret_col(self) -> int | None:
        """Column the caret was last positioned to (None = no jump yet)."""
        match = re.findall(r'\r(?:\x1b\[(\d+)A)?\x1b\[(\d+)C\x1b\[\?25h', self.raw)
        return int(match[-1][1]) if match else None

    def osc8_count(self) -> int:
        return len(re.findall(r'\x1b\]8;;[^\x1b]+\x1b\\', self.raw))

    # -- teardown ----------------------------------------------------------

    def quit(self) -> None:
        try:
            self.write(b'\x03')
            time.sleep(0.8)
            os.kill(self.pid, 9)
        except (OSError, ProcessLookupError):
            pass
        try:
            os.waitpid(self.pid, 0)
        except ChildProcessError:
            pass
        try:
            os.close(self.fd)
        except OSError:
            pass
        shutil.rmtree(self.tmp, ignore_errors=True)
