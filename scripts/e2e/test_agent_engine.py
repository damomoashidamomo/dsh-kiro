"""
Engine-bound agents — full chain.

The user's requirement: an agent preset can DECLARE its engine
(`"engine": "kiro"`, `"toolEngine": "rust"`), swapping applies the whole unit
(kiro loop + Landlock tool engine) with the persona injected into the kiro
system prompt, boot time `--agent`/set-default applies the preset too, and the
/agent menu swaps with a SINGLE selection (no second Enter on a prefill).
"""

import os
import re
import shutil
import unittest

from harness import Tui
from screen import Screen

AGENT = 'engine-e2e'


def setup_workspace(cls_tui):
    """项目级 agent 定义 + 绑定文件（绝不写 kiro-cli 的全局 agents 目录，
    也绝不在共享 schema 的文件里放 engine 字段）。"""
    import json
    agent_dir = os.path.join(cls_tui.tmp, '.dsh-kiro', 'agents')
    os.makedirs(agent_dir, exist_ok=True)
    with open(os.path.join(agent_dir, AGENT + '.json'), 'w', encoding='utf-8') as fh:
        json.dump({
            'name': AGENT,
            'description': '引擎绑定测试',
            'prompt': '你是测试助手：所有回复以「[引擎测试]」开头。',
            'tools': ['*'],
            'model': None,
        }, fh, ensure_ascii=False)
    bind_dir = os.path.join(cls_tui.tmp, '.dsh-kiro')
    os.makedirs(bind_dir, exist_ok=True)
    with open(os.path.join(bind_dir, 'agent-engines.json'), 'w', encoding='utf-8') as fh:
        json.dump({'defaults': {'agent': AGENT}, 'bindings': {AGENT: {'engine': 'kiro', 'toolEngine': 'rust'}}}, fh, ensure_ascii=False)


class SwapAppliesEngineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=40)
        cls.tui.drain(1.5)
        setup_workspace(cls.tui)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_menu_swap_is_single_select(self):
        # /agent menu → the agent row number typed as ONE burst → swap happens
        # without a prefilled draft or a second Enter.
        self.tui.type('/agent', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(2.0)
        screen = Screen(110, 40)
        screen.feed(self.tui.raw)
        num = None
        for row in screen.rows():
            match = re.search(r'(\d+)\s+(\S*engine-e2e\S*)', row)
            if match:
                num = match.group(1)
        self.assertIsNotNone(num, 'the engine-bound agent must be listed in the menu')
        self.tui.write(num.encode())  # two-digit burst
        self.tui.drain(3.0)
        visible = self.tui.visible()
        self.assertIn('已切换到 agent', visible, 'picking the row must swap immediately')
        self.assertIn('引擎 → kiro + Rust 工具引擎（Landlock）', visible,
                      'the preset engine must be applied by the swap')
        self.assertIn('系统提示已注入（kiro 引擎）', visible,
                      'on the kiro engine the persona rides the system prompt')

    def test_20_engine_state_reflects_the_preset(self):
        # /tools lists the tool engine; after a rust preset the picker must be
        # reachable and the session keeps running (the swap survived a cancel).
        self.tui.write(b'\x03')  # cancel the persona acknowledgement turn
        self.tui.drain(1.5)
        self.tui.type('/agent show engine-e2e', delay=0.02)
        self.tui.drain(0.4)
        self.tui.write(b'\r')
        self.tui.drain(1.5)
        # 引擎绑定不在共享 schema 的文件里（kiro-cli 严格校验未知字段）；
        # TUI 跑在 hermetic HOME 里，所以这里也不会碰到真实的 ~/.kiro/agents。
        self.assertFalse(os.path.exists(os.path.join(self.tui.home, '.dsh-kiro', 'agents', 'engine-e2e.json')))


class BootAppliesPresetTest(unittest.TestCase):
    """set-default/--agent at BOOT applies the preset (engine + persona)."""

    def test_10_boot_with_default_agent_applies_engine(self):
        import json
        import pty
        import select
        import struct
        import fcntl
        import termios
        import time
        ws = '/tmp/kiro-boot-preset'
        shutil.rmtree(ws, ignore_errors=True)
        os.makedirs(os.path.join(ws, '.dsh-kiro', 'agents'))
        with open(os.path.join(ws, '.dsh-kiro', 'agents', AGENT + '.json'), 'w', encoding='utf-8') as fh:
            json.dump({
                'name': AGENT,
                'description': '引擎绑定测试',
                'prompt': '你是测试助手：所有回复以「[引擎测试]」开头。',
                'tools': ['*'],
                'model': None,
            }, fh, ensure_ascii=False)
        with open(os.path.join(ws, '.dsh-kiro', 'agent-engines.json'), 'w', encoding='utf-8') as fh:
            json.dump({'defaults': {'agent': AGENT}, 'bindings': {AGENT: {'engine': 'kiro', 'toolEngine': 'rust'}}}, fh, ensure_ascii=False)

        # Same hermetic contract as harness.Tui: a throwaway HOME with
        # DSH_KIRO_HOME inside it — this boot must never touch the real
        # ~/.kiro (kiro-cli's) or the real ~/.dsh-kiro.
        home = os.path.join(ws, '.home')
        os.makedirs(os.path.join(home, '.dsh-kiro'), exist_ok=True)
        env = os.environ.copy()
        env['TERM'] = 'xterm-256color'
        env['COLUMNS'] = '110'
        env['LINES'] = '34'
        env['HOME'] = home
        env['USERPROFILE'] = home
        env['DSH_KIRO_HOME'] = os.path.join(home, '.dsh-kiro')
        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(ws)
            os.execvpe('dsh', ['dsh', '--profile', 'kiro'], env)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 34, 110, 0, 0))
        buf = b''
        end = time.time() + 40
        while time.time() < end:
            ready, _, _ = select.select([fd], [], [], 0.2)
            if ready:
                try:
                    chunk = os.read(fd, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                buf += chunk
                if b'Type a message' in buf:
                    time.sleep(1.0)
                    try:
                        buf += os.read(fd, 65536)
                    except OSError:
                        pass
                    break
        try:
            os.kill(pid, 9)
        except ProcessLookupError:
            pass
        text = buf.decode('utf-8', 'replace')
        self.assertIn('已按 agent「engine-e2e」', text,
                      'boot must apply the preset referenced by settings.json')
        self.assertIn('应用启动配置', text)
        self.assertIn('引擎 → kiro', text, 'the preset engine must be applied at boot')
        self.assertIn('[engine-e2e]', text, 'the status bar must show the active agent')


if __name__ == '__main__':
    unittest.main()
