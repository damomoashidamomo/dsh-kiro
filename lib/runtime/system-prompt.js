/**
 * kiro-system-prompt — assembles the kiro-loop system prompt.
 *
 * Extracted from the runtime mount so the section ORDER is unit-testable:
 * 0.9.10 moved the built-in guardrail (change guardrail + terminal typography
 * ≤90 columns) to the very top of the prompt. Appended at the tail it sat
 * behind persona + skills + steering, and long-prompt attention decay made
 * real models (volcengine ark-code-latest) ignore the ≤90-column rule and
 * emit a 200-column one-liner that the terminal then cut in half.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/system-prompt
 */
import { GUARDRAIL_TEXT } from "../guardrail/index.js";
/**
 * Build the kiro-loop system prompt.
 *
 * Order is contractual and pinned by tests: identity → **guardrail** →
 * persona → skills catalog → steering. The guardrail sits second (only after
 * the two identity lines) because everything below it is long and
 * user-controlled, and anything below it tends to lose attention.
 */
export function composeKiroSystemPrompt(input) {
    const personaPrompt = input.persona !== undefined
        && input.persona.prompt !== undefined
        && input.persona.prompt.trim() !== ''
        ? ['', `## 当前智能体预设：${input.persona.name ?? 'custom'}`, input.persona.prompt.trim()]
        : [];
    const skills = input.skills ?? [];
    const skillsSection = skills.length > 0
        ? ['', '## 可用技能目录（凡任务/检索匹配时，先用 skill 工具加载对应技能再行动）',
            ...skills.map((skill) => `- ${skill.name}：${skill.description}`)]
        : [];
    const steeringText = input.steering ?? '';
    return [
        'You are a coding agent running inside the Kiro TUI for DeepSeek Harness.',
        `Your working directory is ${input.cwd}.`,
        // 0.9.10：护栏提到最前——置于长提示尾部时模型注意力衰减、实测无视
        // 「单行命令 ≤90 列」规则（volcengine ark-code-latest 反复输出超宽单行）。
        '', GUARDRAIL_TEXT,
        ...personaPrompt,
        ...skillsSection,
        ...(steeringText !== '' ? ['', steeringText] : []),
    ].join('\n');
}
//# sourceMappingURL=system-prompt.js.map