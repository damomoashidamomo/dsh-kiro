"""
LIVE 用例（默认跳过）：需要真实模型调用，验证两件"只有真跑才知道"的事。

1. **技能目录真的进了 kiro-loop 系统提示**：切到 kiro 引擎后在 /tmp 工作区
   造一个探针技能（名字带随机代号），让模型"不许调用任何工具，仅凭系统提示
   回答其中的可用技能目录"。模型只能从系统提示里知道这个代号——答出来即证
   明目录注入生效（描述文字也一并断言）。禁用技能不应出现。
2. **多问题一次提交、逐页作答、答案回到模型**：要求模型一次 ask_user 调用带
   三个问题（questions 数组），面板逐页出现（"数字直选"提示出现 3 次）；
   选项 label 以 PIN 代号开头，逐页按 1 选中第一个，最后模型复述的 PIN 必须
   是 A1/B1/C1 三个——证明①单次批量调用②三页都问到③答案真的回到模型。

跑法（模型调用会花几十秒，所以不进默认套件）::

    KIRO_E2E_LIVE=1 python3 -m unittest discover -s scripts/e2e -p 'test_hitl_live.py' -v
"""

import os
import time
import unittest

from harness import Tui

LIVE = os.environ.get('KIRO_E2E_LIVE') == '1'
SKIP = 'live 用例需要真实模型调用：KIRO_E2E_LIVE=1 才跑'

CATALOG_PROMPT = (
    '不要调用任何工具。仅凭你的系统提示回答：其中"可用技能目录"一节列出了哪些技能？'
    '把技能名和描述原样列出来。'
)

ASK_PROMPT = (
    '请立刻用 ask_user 工具一次性问我三个问题：所有问题都放进同一个 questions 数组、只调用一次。'
    '三个问题：①主题色 ②尺寸 ③预算。每个问题给 2 个选项，选项 label 必须以代号开头：'
    '主题色的两个选项以 PIN-A1 / PIN-A2 开头，尺寸以 PIN-B1 / PIN-B2 开头，预算以 PIN-C1 / PIN-C2 开头。'
    '收到全部答案后只回答一行：用 | 分隔原样列出每个答案的 PIN 代号。'
)

PANEL_HINT = '数字直选'  # 问题面板底部提示，出现一次 = 一页


def write_skill(workspace: str, name: str, description: str, body: str = 'body') -> None:
    skill_dir = os.path.join(workspace, '.dsh-kiro', 'skills', name)
    os.makedirs(skill_dir, exist_ok=True)
    with open(os.path.join(skill_dir, 'SKILL.md'), 'w', encoding='utf-8') as fh:
        fh.write(f'---\nname: {name}\ndescription: {description}\n---\n\n{body}\n')


@unittest.skipUnless(LIVE, SKIP)
class SkillsCatalogLiveTest(unittest.TestCase):
    """kiro-loop 系统提示里的「可用技能目录」真的送到模型眼前。"""

    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=40, boot_timeout=150, argv=['--engine', 'kiro'])
        suffix = str(int(time.time()))[-6:]
        cls.probe = f'probe-catalog-{suffix}'
        cls.off = f'probe-off-{suffix}'
        write_skill(cls.tui.tmp, cls.probe, '目录注入验证探针技能')
        write_skill(cls.tui.tmp, cls.off, '被禁用的探针技能')
        # 关掉一个：禁用技能不该出现在目录里（provider 层过滤）。
        cls.tui.type(f'/skills {cls.off} off', delay=0.01)
        cls.tui.drain(0.4)
        cls.tui.write(b'\r')
        cls.tui.drain(1.5)
        cls.tui.type(CATALOG_PROMPT, delay=0.01)
        cls.tui.drain(0.3)
        cls.tui.write(b'\r')
        cls.answered = cls.tui.wait_for(cls.probe, 180)
        cls.tui.drain(3.0)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_enabled_skill_is_in_the_prompt_catalog(self):
        self.assertTrue(self.answered, '模型没能说出探针技能名——技能目录没有进系统提示')
        visible = self.tui.visible()
        self.assertIn(self.probe, visible)
        self.assertIn('目录注入验证探针技能', visible, '描述也要在目录里（正文才按需加载）')

    def test_20_disabled_skill_is_filtered_out(self):
        # 禁用技能在 provider 层就被过滤，模型既看不到也不会提。只从"提问之后"
        # 的回复区里查——前面 /skills 命令的回显本来就带着这个名字。
        visible = self.tui.visible()
        start = visible.rfind(CATALOG_PROMPT)
        self.assertGreaterEqual(start, 0, '找不到提问回显')
        self.assertNotIn(self.off, visible[start:], '被禁用的技能不该出现在模型的目录回答里')


@unittest.skipUnless(LIVE, SKIP)
class BatchedAskUserLiveTest(unittest.TestCase):
    """一次 ask_user 带三个问题：逐页作答、答案原样回到模型。"""

    @classmethod
    def setUpClass(cls):
        cls.tui = Tui(columns=110, lines=40, boot_timeout=150, argv=['--engine', 'kiro'])
        cls.tui.drain(0.5)
        cls.tui.type(ASK_PROMPT, delay=0.01)
        cls.tui.drain(0.3)
        cls.tui.write(b'\r')
        cls.pages = 0
        deadline = time.time() + 240
        while cls.pages < 3 and time.time() < deadline:
            cls.tui.drain(0.4)
            shown = cls.tui.raw.count(PANEL_HINT)
            if shown > cls.pages:
                cls.pages = shown
                cls.tui.write(b'1')  # 每页选第一个选项 → PIN-A1 / PIN-B1 / PIN-C1
                cls.tui.drain(1.2)
        cls.final = cls.tui.wait_for('PIN-', 240)
        cls.tui.drain(4.0)

    @classmethod
    def tearDownClass(cls):
        cls.tui.quit()

    def test_10_one_call_carries_three_questions(self):
        visible = self.tui.visible()
        self.assertEqual(visible.count('✓ ask_user'), 1,
                         '三个问题必须在一次 ask_user 调用里（面板逐页走），不能分三次调用')
        self.assertIn('questions', visible, '调用参数要用 questions 数组')
        for pin in ('PIN-A1', 'PIN-B1', 'PIN-C1'):
            self.assertIn(pin, visible, f'{pin} 应出现在这次调用的参数里')

    def test_20_panel_walked_three_pages(self):
        self.assertEqual(self.pages, 3, f'应逐页出现 3 个问答面板，实际 {self.pages}')

    def test_30_answers_reach_the_model(self):
        self.assertTrue(self.final, '模型没有复述答案')
        tail = self.tui.visible()[-4000:]
        line = [row for row in tail.split('\n') if 'PIN-A1' in row and '|' in row]
        self.assertTrue(line, '模型最终一行应列出三个 PIN')
        self.assertIn('PIN-A1', line[-1])
        self.assertIn('PIN-B1', line[-1], '第二页的答案没回到模型')
        self.assertIn('PIN-C1', line[-1], '第三页的答案没回到模型')


if __name__ == '__main__':
    unittest.main()
