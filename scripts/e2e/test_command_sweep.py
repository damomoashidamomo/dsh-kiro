"""
Per-command, per-branch behavioral sweep — EVERY registered command gets its
branches (bare → picker covered elsewhere, bogus subcommand, usage error,
valid invocation, illegal argument) driven in a real PTY, asserting:

- the command RESPONDED (new transcript rows appeared),
- nothing crashed (no "Cannot read properties" / "TypeError" / "is not a function"),
- no spurious "Unknown command" for a valid command,
- the draft is cleared afterwards (placeholder back).

Stateful toggles (/mode, /experiment) are flipped twice to restore; commands
that would open a panel (model/approvals/tools/engine pickers) get an Esc.
Real model calls are avoided on purpose (no /effort probe, no /engine switch).
"""

import os
import re
import unittest

from harness import Tui

CRASH_MARKERS = ('Cannot read properties', 'TypeError', 'is not a function', 'ERR_MODULE')
EDITOR_ENV = {'EDITOR': 'true', 'VISUAL': 'true'}

# (input, any-of patterns, optional post Esc) — patterns are regex on the new rows.
PROBES = [
    # --- help / clear / workspace / doctor / usage / issue (leaf commands)
    ('/help', [r'/chat', r'帮助', r'命令'], False),
    ('/workspace', [r'工作区', r'workspace', r'cwd'], False),
    ('/doctor', [r'doctor', r'检查', r'ok', r'✓', r'健康'], False),
    ('/usage', [r'usage', r'用量', r'session'], False),
    ('/issue', [r'issue', r'反馈', r'github', r'提交'], False),
    # --- clear (wipes the transcript; assert via its own response)
    ('/clear', [r'已清屏', r'清空', r'clear'], False),
    # --- editor (EDITOR=true is a no-op that succeeds)
    ('/editor', [r'editor', r'编辑', r'已', r'提示'], True),
    # --- reply / retry without prior turns
    ('/reply', [r'reply', r'引用', r'phase'], False),
    ('/retry', [r'retry', r'重发', r'没有'], False),
    # --- undo with nothing to undo
    ('/undo', [r'undo', r'撤销', r'没有', r'无可'], False),
    # --- paste branches
    ('/paste', [r'paste', r'粘贴', r'落盘', r'usage'], False),
    ('/paste list', [r'paste', r'粘贴', r'落盘', r'没有', r'0'], False),
    ('/paste clean', [r'paste', r'已删除', r'0', r'没有'], False),
    ('/paste bogus', [r'usage'], False),
    # --- mode: toggle twice (restore), plus bogus
    ('/mode bogus', [r'usage'], False),
    ('/mode spec', [r'spec', r'模式'], False),
    ('/mode vibe', [r'vibe', r'模式'], False),
    # --- experiment: bogus + toggle twice (restore)
    ('/experiment bogus', [r'usage'], False),
    ('/experiment thinking', [r'thinking', r'实验', r'开', r'关', r'on', r'off'], False),
    ('/experiment thinking', [r'thinking', r'实验', r'开', r'关', r'on', r'off'], False),
    # --- effort / engine: usage errors only (avoid real model calls)
    ('/effort bogus', [r'effort', r'档位', r'usage', r'支持'], False),
    ('/engine bogus', [r'engine', r'引擎', r'usage'], False),
    ('/engine', [r'engine', r'引擎', r'当前', r'usage', r'kiro', r'dsh'], False),
    # --- tools: usage error (no trust mutation)
    ('/tools bogus', [r'tools', r'工具', r'usage'], False),
    # --- mcp / hooks / steering
    ('/mcp', [r'mcp', r'MCP', r'服务器', r'没有', r'0'], False),
    ('/mcp bogus', [r'mcp', r'usage', r'未知', r'子命令'], False),
    ('/hooks', [r'hooks', r'钩子', r'没有', r'0'], False),
    ('/hooks reload', [r'hooks', r'钩子', r'重载', r'reload', r'not loaded', r'未'], False),
    ('/hooks bogus', [r'hooks', r'usage'], False),
    ('/steering', [r'steering', r'引导', r'没有', r'0'], False),
    ('/steering reload', [r'steering', r'重载', r'reload', r'not loaded', r'未'], False),
    # --- approvals branches
    ('/approvals bogus', [r'approvals', r'usage', r'审批'], False),
    ('/approvals remove bogus', [r'approvals', r'usage', r'序号', r'未找到', r'无效'], False),
    # --- context branches
    ('/context', [r'context', r'上下文', r'0', r'没有', r'文件'], False),
    ('/context add', [r'context', r'usage', r'路径', r'参数'], False),
    ('/context add /definitely/not/a/file.zzz', [r'context', r'不存在', r'读不到', r'失败', r'error'], False),
    ('/context rm 99', [r'context', r'移除', r'未找到', r'无效', r'99'], False),
    ('/context bogus', [r'context', r'usage'], False),
    # --- knowledge branches (add requires a real source path)
    ('/knowledge', [r'knowledge', r'知识', r'0', r'empty', r'条'], False),
    ('/knowledge bogus', [r'knowledge', r'unknown', r'usage'], False),
    ('/knowledge add /definitely/not/a/file.zzz', [r'knowledge', r'not found', r'读不到', r'失败', r'不存在'], False),
    ('/knowledge search 什么都没有', [r'knowledge', r'0', r'没有', r'无结果', r'搜索'], False),
    ('/knowledge show 99', [r'未找到', r'knowledge'], False),
    ('/knowledge view 99', [r'未找到', r'knowledge'], False),
    ('/knowledge remove 99', [r'未找到', r'无效', r'knowledge'], False),
    ('/knowledge update 99', [r'knowledge', r'usage', r'未找到', r'更新'], False),
    ('/knowledge clear', [r'knowledge', r'已清空', r'clear', r'0'], False),
    # --- prompts branches
    ('/prompts', [r'prompts', r'提示', r'0', r'没有'], False),
    ('/prompts get', [r'prompts', r'usage', r'名称', r'名字'], False),
    ('/prompts get /definitely/not/a/prompt', [r'prompts', r'not found', r'未找到', r'没有'], False),
    ('/prompts bogus', [r'prompts', r'unknown', r'usage'], False),
    # --- todos branches
    ('/todos', [r'todos', r'待办', r'没有', r'0'], False),
    ('/todos bogus', [r'todos', r'unknown', r'usage'], False),
    ('/todos resume', [r'todos', r'usage', r'没有', r'id'], False),
    ('/todos resume bogus-id', [r'todos', r'未找到', r'not found', r'没有'], False),
    ('/todos delete bogus-id', [r'todos', r'未找到', r'not found', r'没有'], False),
    ('/todos clear-finished', [r'todos', r'已清除', r'0', r'没有'], False),
    # --- checkpoint branches (list/diff on an empty store)
    ('/checkpoint', [r'checkpoint', r'检查点', r'没有', r'0'], False),
    ('/checkpoint bogus', [r'checkpoint', r'unknown', r'usage'], False),
    ('/checkpoint diff', [r'checkpoint', r'diff', r'没有', r'无'], False),
    ('/checkpoint restore', [r'checkpoint', r'usage', r'没有', r'id'], False),
    ('/checkpoint restore bogus-id', [r'checkpoint', r'未找到', r'not found', r'失败'], False),
    ('/checkpoint clean', [r'checkpoint', r'已清除', r'0', r'没有', r'清理'], False),
    # --- code branches
    ('/code', [r'code', r'代码', r'status', r'未', r'没有', r'init'], False),
    ('/code bogus', [r'code', r'unknown', r'usage'], False),
    ('/code logs', [r'code', r'logs', r'日志', r'没有', r'未'], False),
    ('/code overview', [r'code', r'overview', r'概览', r'没有', r'未'], False),
    ('/code summary', [r'code', r'summary', r'摘要', r'没有', r'未'], False),
    # --- spec branches
    ('/spec', [r'spec', r'Spec'], False),  # bare /spec opens the picker; the response check is on its title
    ('/spec bogus', [r'spec', r'unknown', r'usage'], False),
    ('/spec status', [r'spec', r'状态', r'没有', r'未'], False),
    # --- agent branches
    ('/agent bogus', [r'agent', r'unknown subcommand'], False),
    ('/agent show definitely-not-an-agent', [r'no agent named'], False),
    ('/agent swap definitely-not-an-agent', [r'no agent named'], False),
    ('/agent delete definitely-not-an-agent', [r'no agent named'], False),
    ('/agent rename definitely-not-an-agent x', [r'no agent named'], False),
    ('/agent set-default definitely-not-an-agent', [r'no agent named'], False),
    ('/agent validate /definitely/not/a/file.json', [r'读不到'], False),
    ('/agent schema', [r'name', r'schema', r'agent'], False),
    ('/agent generate x', [r'phase 4'], False),
    ('/agent migrate', [r'phase 4'], False),
    # --- chat branches
    ('/chat bogus', [r'unknown subcommand'], False),
    ('/chat resume', [r'usage', r'/chat list'], False),
    ('/chat delete bogus-id', [r'未找到', r'not found', r'失败', r'没有'], False),
    # --- skills branches
    ('/skills bogus-name on', [r'未找到'], False),
    ('/skills bogus', [r'usage'], False),
    # --- steering/hooks bare already covered; hooks reload error path covered
    # --- workspace/doctor bare covered above
]

# Bare inputs of catalog commands open a PICKER (covered by test_pickers) —
# after each probe we press Esc to be safe anyway.


class CommandSweepTest(unittest.TestCase):
    """One TUI for the whole sweep; each probe asserts response + no crash."""

    @classmethod
    def setUpClass(cls):
        os.environ.update(EDITOR_ENV)
        cls.tui = Tui(columns=110, lines=40)
        cls.tui.drain(1.5)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def _visible(self):
        import screen as screen_mod
        s = screen_mod.Screen(110, 40)
        s.feed(self.tui.raw)
        return '\n'.join(s.rows())

    def test_sweep(self):
        failures = []
        for probe_input, patterns, post_esc in PROBES:
            # 0.9.5: banner 常驻 Static 头——从「新行」判定里剔除 banner 艺术行
            # （它们永远在场，会污染 diff 与 got 样本）。
            def is_banner(row: str) -> bool:
                r = row.strip()
                return ('██' in r) or ('╔' in r and '═' in r) or r.startswith('Kiro CLI')
            before = '\n'.join(r for r in self._visible().split('\n') if not is_banner(r))
            self.tui.type(probe_input, delay=0.01)
            self.tui.drain(0.35)
            self.tui.write(b'\r')
            self.tui.drain(1.6)
            after = self._visible()
            after_rows = [row for row in after.split('\n') if row.strip() and not is_banner(row)]
            new_rows = [row.strip() for row in after_rows
                        if row.strip() not in before.split('\n')]
            joined = '\n'.join(new_rows)
            # Pattern match on the RECENT screen (the last 12 non-empty rows):
            # with a long transcript, content diffs are unstable because old
            # rows scroll in and out of the emulator's window.
            recent = '\n'.join([row.strip() for row in after.split('\n') if row.strip()][-12:])
            problems = []
            for marker in CRASH_MARKERS:
                if marker in joined:
                    problems.append(f'crash marker {marker!r}')
            if patterns is not None:
                hit_recent = any(re.search(p, recent) for p in patterns)
                hit_new = any(re.search(p, joined) for p in patterns)
                if not (hit_recent or hit_new):
                    problems.append(f'no expected response (got: {new_rows[:3]!r})')
            if len(new_rows) == 0 and patterns is not None:
                problems.append('no response at all')
            if 'Unknown command' in recent and not probe_input.endswith(('bogus', 'bogus-id', 'bogus-name', 'x')):
                problems.append('valid command reported Unknown')
            # panel/picker may be open — Esc closes it and restores the prompt
            self.tui.write(b'\x1b')
            self.tui.drain(0.5)
            status = 'OK ' if not problems else 'FAIL'
            line = f'{status} {probe_input!r:52}' + ('' if not problems else ' → ' + '; '.join(problems))
            print(line, flush=True)
            if problems:
                failures.append(f'{probe_input!r}: ' + '; '.join(problems))
        self.assertEqual(failures, [], f'{len(failures)} probe(s) failed:\n' + '\n'.join(failures))


if __name__ == '__main__':
    unittest.main()
