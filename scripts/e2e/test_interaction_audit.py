"""
人类交互审计（LIVE，默认跳过）——逐项模拟真实按键流。

覆盖三块此前只有单测、没有 PTY 真实按键验证的交互面：

A. 工具审批面板：允许一次 / 拒绝（填理由）/ 本会话始终允许 → 信任生效不再问
B. ask_user 问题面板：多页含自由输入页逐页作答；Esc=插话（dismissed）后会话仍可用
C. 运行中插话：长回答期间 Esc 提交插话 → 「已插话（下一步生效）」 → 会话可用

跑法::

    KIRO_E2E_LIVE=1 python3 -m unittest discover -s scripts/e2e -p 'test_interaction_audit.py' -v
"""

import os
import time
import unittest

from harness import Tui
from screen import Screen

PANEL = '工具需要批准'
IDLE = '· idle'


def wait_idle(tui, timeout=180):
    tui.wait_for(IDLE, timeout)


def wait_file(path, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(path):
            return True
        time.sleep(0.5)
    return False


def panel_rows(tui, cols=110, lines=40):
    screen = Screen(cols, lines)
    screen.feed(tui.raw)
    return screen.rows()


@unittest.skipUnless(os.environ.get('KIRO_E2E_LIVE') == '1', 'LIVE 用例需要真实模型：KIRO_E2E_LIVE=1 才跑')
class ApprovalPanelAuditTest(unittest.TestCase):
    """工具审批面板的四种人类决策路径（一个 TUI 顺序走完，保留信任状态）。"""

    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=40, boot_timeout=150, argv=['--engine', 'kiro'])
        cls.tui.drain(1.0)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def send(self, text):
        self.tui.type(text, delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')

    def marker(self):
        return len(self.tui.raw)

    def wait_new_panel(self, marker, timeout=150):
        """Panel text must appear in the region appended after `marker` — the
        whole-buffer wait_for used to match the PREVIOUS test's panel echo and
        keystrokes landed in the main draft instead."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.tui.drain(0.5)
            if PANEL in self.tui.raw[marker:]:
                return True
        return False

    def test_10_allow_once_creates_the_file(self):
        path = os.path.join(self.tui.tmp, 'a-approve.txt')
        mark = self.marker()
        self.send('请在当前目录创建文件 a-approve.txt，内容只写 ok 两个字。现在就调用写文件工具。')
        self.assertTrue(self.wait_new_panel(mark), '第一次写文件必须弹出审批面板')
        self.tui.write(b'1')  # 允许一次
        self.assertTrue(wait_file(path), '允许一次后文件必须被创建')
        wait_idle(self.tui)
        self.assertFalse(os.path.exists(path + '.bak'))

    def test_20_reject_with_reason_does_not_create(self):
        path = os.path.join(self.tui.tmp, 'b-reject.txt')
        mark = self.marker()
        self.send('请在当前目录创建文件 b-reject.txt，内容只写 no。现在就调用写文件工具。')
        self.assertTrue(self.wait_new_panel(mark), '新文件必须再次弹出审批面板（允许一次只管一次）')
        self.tui.write(b'4')  # 拒绝（可填理由）
        self.tui.drain(1.0)
        self.tui.type('不要创建这个文件，直接告诉我你收到了拒绝', delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')
        # 拒绝理由要作为「用户拒绝了…理由：…」注回到模型
        self.assertTrue(self.tui.wait_for('用户拒绝了', 120), '拒绝理由必须回到模型')
        self.assertFalse(os.path.exists(path), '被拒绝的写操作绝不能落盘')
        wait_idle(self.tui)

    def test_30_allow_for_session_then_no_more_prompts(self):
        path_c = os.path.join(self.tui.tmp, 'c-session.txt')
        mark = self.marker()
        self.send('请在当前目录创建文件 c-session.txt，内容只写 ok。现在就调用写文件工具。')
        self.assertTrue(self.wait_new_panel(mark), '第三次写文件仍应弹面板（前面只允许过一次）')
        self.tui.write(b'2')  # 本会话始终允许
        if not wait_file(path_c):
            screen = Screen(110, 40)
            screen.feed(self.tui.raw)
            tail = [row for row in screen.rows() if row.strip()][-25:]
            self.fail('本会话允许后文件必须被创建；现场：\n' + '\n'.join(tail))
        wait_idle(self.tui)
        mark_d = self.marker()
        path_d = os.path.join(self.tui.tmp, 'd-noask.txt')
        self.send('请在当前目录创建文件 d-noask.txt，内容只写 ok。现在就调用写文件工具。')
        self.assertTrue(wait_file(path_d, 120), '本会话信任后写文件应直接执行')
        wait_idle(self.tui)
        self.assertNotIn(PANEL, self.tui.raw[mark_d:], '本会话信任后绝不能再弹审批面板')


@unittest.skipUnless(os.environ.get('KIRO_E2E_LIVE') == '1', 'LIVE 用例需要真实模型：KIRO_E2E_LIVE=1 才跑')
class QuestionPanelAuditTest(unittest.TestCase):
    """ask_user：多页含自由输入页逐页作答；Esc 打断后会话仍可用。"""

    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=40, boot_timeout=150, argv=['--engine', 'kiro'])
        cls.tui.drain(1.0)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def send(self, text):
        self.tui.type(text, delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')

    def test_10_multi_page_with_free_text_last(self):
        prompt = ('请立刻用 ask_user 一次调用问我四个问题（都放进 questions 数组）：'
                  '①目的地（选项：A 海边 / B 山里）②天数（选项：3 天 / 7 天）'
                  '③预算（选项：5 千内 / 1 万内）'
                  '④同行人（这题不要给 options，让自由输入）。'
                  '收到答案后用一句话复述四个答案。')
        self.send(prompt)
        deadline = time.time() + 240
        pages = 0
        while pages < 3 and time.time() < deadline:
            self.tui.drain(0.4)
            shown = self.tui.raw.count('数字直选')
            if shown > pages:
                pages = shown
                self.tui.write(b'1')
                self.tui.drain(1.2)
        # 第 4 页：无选项 → 直接文字输入
        deadline = time.time() + 120
        while time.time() < deadline:
            self.tui.drain(0.4)
            if any('回答：' in row for row in panel_rows(self.tui)):
                break
        self.tui.type('独自出行+慢节奏', delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')
        deadline = time.time() + 300
        while time.time() < deadline:
            visible = self.tui.visible()
            if '独自出行' in visible or '用户回答：' in visible:
                break
            self.tui.drain(0.5)
        else:
            screen = Screen(110, 40)
            screen.feed(self.tui.raw)
            tail = [row for row in screen.rows() if row.strip()][-25:]
            self.fail('自由输入的答案必须被模型复述；现场：\n' + '\n'.join(tail))
        wait_idle(self.tui)

    def test_20_esc_dismisses_panel_and_session_survives(self):
        self.send('用 ask_user 问我一个问题：坐飞机还是高铁（两个选项）。')
        self.assertTrue(self.tui.wait_for('数字直选', 180), '问题面板必须出现')
        self.tui.write(b'\x1b')  # Esc = 插话/取消面板
        self.tui.drain(2.0)
        wait_idle(self.tui)
        # 打断后会话必须仍可用：直接提问，模型要能回答
        self.send('刚才我打断了提问。直接回答：1+1 等于几？不要再用 ask_user。')
        self.assertTrue(self.tui.wait_for('2', 120), '打断后模型必须能正常回答')
        wait_idle(self.tui)
        visible = self.tui.visible()
        self.assertNotIn('回合失败', visible[-2000:] if len(visible) > 2000 else visible, '打断不能导致回合报错')


@unittest.skipUnless(os.environ.get('KIRO_E2E_LIVE') == '1', 'LIVE 用例需要真实模型：KIRO_E2E_LIVE=1 才跑')
class InsertWhileBusyAuditTest(unittest.TestCase):
    """长回答运行中 Esc 插话 → 「已插话（下一步生效）」→ 会话继续可用。"""

    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=40, boot_timeout=150, argv=['--engine', 'kiro'])
        cls.tui.drain(1.0)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def send(self, text):
        self.tui.type(text, delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')

    def test_10_insert_during_long_answer(self):
        self.tui.type('请把下面这句话重复朗读二十五遍，一字不漏：今天天气很好适合出门。', delay=0.01)
        self.tui.drain(0.3)
        self.tui.write(b'\r')
        # 等到真正开始输出（running）
        # kiro 循环不把状态栏 patch 成 running（平台循环才 patch）——
        # 用流式输出证据判断回合已开始。
        if not self.tui.wait_for('今天天气很好适合出门。', 180):
            self.tui.drain(2.0)
            screen = Screen(110, 40)
            screen.feed(self.tui.raw)
            tail = [row for row in screen.rows() if row.strip()][-20:]
            self.fail('回合必须先进入 running；现场：\n' + '\n'.join(tail))
        time.sleep(2)
        # 插话的按键是「回车提交」（运行中提交自动转为插话）；Esc 只在
        # 问题/审批面板上是「插话（回到输入框）」，在主输入框会被吞掉。
        self.tui.type('插话内容：请加快', delay=0.01)
        self.tui.write(b'\r')
        self.assertTrue(self.tui.wait_for('已插话', 30), '必须出现「已插话（下一步生效）」回执')
        wait_idle(self.tui, 300)
        self.send('现在回答：1+1 等于几？只回答数字。')
        self.assertTrue(self.tui.wait_for('2', 120), '插话后下一轮必须正常工作')
        wait_idle(self.tui)


if __name__ == '__main__':
    unittest.main()
