"""
faux 确定性交互测试（无真实模型，进默认套件）。

DSH_KIRO_FAUX_LLM 指向脚本 → LlmPort 用 faux 供应商回放固定回合；工具是
**真实执行**的（审批面板照常弹、文件真的写盘）——因此审批链路、ask_user
多页面板链路都能在零模型、零限流抖动下逐键验证。这正是 LIVE 审计里限流
抖动的根除方案（pi 的 faux 供应商模式）。
"""

import json
import os
import time
import unittest

from harness import Tui
from screen import Screen

PANEL = '工具需要批准'


def write_faux_script(path, turns):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'turns': turns}, fh, ensure_ascii=False)


class FauxApprovalFlowTest(unittest.TestCase):
    """faux：write 工具 → 审批面板 → 允许一次 → 文件真实落盘 / 拒绝不落盘。"""

    def setUp(self):
        # 每个用例独立 TUI：faux 脚本在启动时装载一次，游标随会话推进——
        # 共用 TUI 会让中途改写脚本失效（首个版本就是这样错的）。
        self.script = f'/tmp/dsh-faux-{self.id().rsplit(".", 1)[-1]}.json'
        self.tui = None

    def tearDown(self):
        if self.tui is not None:
            self.tui.quit()
        import os
        if os.path.exists(self.script):
            os.remove(self.script)

    def boot(self, turns):
        import os
        write_faux_script(self.script, turns)
        os.environ['DSH_KIRO_FAUX_LLM'] = self.script
        self.tui = Tui(columns=110, lines=40)

    def test_10_write_approved_once_creates_file(self):
        self.boot([
            [
                {'text': '我来创建文件。'},
                {'tool': {'name': 'write', 'arguments': {'file_path': 'faux-out.txt', 'content': 'ok\n'}}},
            ],
            [{'text': '已创建 faux-out.txt。'}],
        ])
        tui = self.tui
        mark = len(tui.raw)
        tui.type('创建 faux-out.txt', delay=0.01)
        tui.drain(0.3)
        tui.write(b'\r')
        deadline = time.time() + 60
        while time.time() < deadline:
            tui.drain(0.4)
            if PANEL in tui.raw[mark:]:
                break
        self.assertIn(PANEL, tui.raw[mark:], 'faux write 必须弹审批面板')
        tui.write(b'1')  # 允许一次
        path = os.path.join(tui.tmp, 'faux-out.txt')
        deadline = time.time() + 60
        while time.time() < deadline and not os.path.exists(path):
            tui.drain(0.4)
        self.assertTrue(os.path.exists(path), '批准后文件必须真实写盘')
        with open(path, encoding='utf-8') as fh:
            self.assertEqual(fh.read(), 'ok\n')
        self.assertTrue(tui.wait_for('已创建 faux-out.txt', 60), '工具结果必须回到模型并续跑收尾')

    def test_20_reject_keeps_file_absent(self):
        self.boot([
            [{'tool': {'name': 'write', 'arguments': {'file_path': 'faux-reject.txt', 'content': 'x'}}}],
            [{'text': '被拒绝，我不写了。'}],
        ])
        tui = self.tui
        mark = len(tui.raw)
        tui.type('创建 faux-reject.txt', delay=0.01)
        tui.drain(0.3)
        tui.write(b'\r')
        deadline = time.time() + 60
        while time.time() < deadline:
            tui.drain(0.4)
            if PANEL in tui.raw[mark:]:
                break
        self.assertIn(PANEL, tui.raw[mark:])
        tui.write(b'4')  # 拒绝（可填理由）
        tui.drain(1.0)
        tui.type('不要写这个文件', delay=0.01)
        tui.drain(0.3)
        tui.write(b'\r')
        self.assertTrue(tui.wait_for('用户拒绝了', 60), '拒绝理由必须回到模型')
        self.assertFalse(os.path.exists(os.path.join(tui.tmp, 'faux-reject.txt')), '被拒文件绝不能落盘')
        self.assertTrue(tui.wait_for('被拒绝，我不写了', 60), '模型必须按拒绝结果收尾')


class FauxAskUserFlowTest(unittest.TestCase):
    """faux：ask_user 工具 → 多页面板逐键作答 → 答案回到模型。"""

    @classmethod
    def setUpClass(cls):
        cls.script = '/tmp/dsh-faux-askuser.json'
        write_faux_script(cls.script, [
            [{'tool': {'name': 'ask_user', 'arguments': {
                'questions': [
                    {'question': '选颜色？', 'header': '颜色', 'options': [{'label': '红'}, {'label': '蓝'}]},
                    {'question': '补充要求？', 'header': '补充'},
                ],
            }}}],
            [{'text': '收到：红，补充=轻量'}],
        ])
        os.environ['DSH_KIRO_FAUX_LLM'] = cls.script
        cls.tui = Tui(columns=110, lines=40)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()
        os.environ.pop('DSH_KIRO_FAUX_LLM', None)
        os.remove(cls.script)

    def test_10_two_pages_paged_and_answered(self):
        mark = len(self.tui.raw)
        self.tui.type('问我两个问题', delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')
        # 第 1 页：选项页（数字直选）
        deadline = time.time() + 60
        while time.time() < deadline:
            self.tui.drain(0.4)
            if '数字直选' in self.tui.raw[mark:]:
                break
        screen = Screen(110, 40)
        screen.feed(self.tui.raw)
        self.assertTrue(any('选颜色' in row for row in screen.rows()), '第 1 页必须渲染')
        self.tui.write(b'1')  # 选 红
        # 第 2 页：无选项自由输入页
        deadline = time.time() + 60
        while time.time() < deadline:
            self.tui.drain(0.4)
            screen = Screen(110, 40)
            screen.feed(self.tui.raw)
            if any('回答：' in row for row in screen.rows()):
                break
        self.tui.type('轻量', delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')
        self.assertTrue(self.tui.wait_for('收到：红，补充=轻量', 60), '两页答案都必须回到模型并被复述')


if __name__ == '__main__':
    unittest.main()
