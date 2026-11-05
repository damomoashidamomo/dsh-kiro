/**
 * Subcommand catalog for the option picker (Enter on a bare `/command`).
 *
 * One row per subcommand a command actually accepts, so pressing Enter on
 * `/chat` lists EVERY chat action — the hand-written picker used to show only
 * list / a few sessions / new and silently omit `delete` and `help`, and most
 * other multi-subcommand commands had no picker at all.
 *
 * `tests/subcommands.spec.ts` cross-checks this table against the `case '…'`
 * labels in each command's handler, so a new subcommand cannot be added
 * without showing up in the picker (and vice versa).
 *
 * @module @damomoashidomomo/dsh-kiro/commands/subcommands
 */
/**
 * Commands that open a picker when submitted bare, and every row it offers.
 * Order is the order shown (everyday actions first, `help` last).
 */
export const COMMAND_PICKERS = {
    chat: {
        title: '会话管理（列出 / 新开 / 恢复 / 删除）',
        rows: [
            { value: 'list', hint: '列出会话（含时间与简介）' },
            { value: 'new', hint: '存盘当前会话并开启新会话' },
            { value: 'resume <id>', hint: '在当前 TUI 内切换到该会话', needsArg: true },
            { value: 'delete <id>', hint: '删除一个存盘会话', needsArg: true },
            { value: 'help', hint: '用法说明' },
        ],
    },
    spec: {
        title: 'Spec 流程（先确认后开发）',
        rows: [
            { value: 'start', hint: '开始新 spec（起草 requirements.md）' },
            { value: 'approve', hint: '确认当前阶段，进入下一阶段' },
            { value: 'show', hint: '查看当前阶段与文件' },
            { value: 'revise <意见>', hint: '打回当前阶段并附修改意见', needsArg: true },
            { value: 'abort', hint: '放弃当前 spec' },
        ],
    },
    agent: {
        title: '自定义 agent（切换 / 管理）',
        rows: [
            { value: 'list', hint: '列出全部自定义 agent' },
            { value: 'swap <name>', hint: '切换到已存在的 agent（也可直接选下面的预设）', needsArg: true },
            { value: 'show <name>', hint: '查看一个 agent 的定义', needsArg: true },
            { value: 'create <name>', hint: '新建 agent（写入 .kiro/agents）', needsArg: true },
            { value: 'edit <name>', hint: '编辑 agent 定义', needsArg: true },
            { value: 'generate <描述>', hint: '用模型生成一个 agent 定义', needsArg: true },
            { value: 'delete <name>', hint: '删除 agent', needsArg: true },
            { value: 'rename <旧> <新>', hint: '重命名 agent', needsArg: true },
            { value: 'set-default <name>', hint: '设为默认 agent', needsArg: true },
            { value: 'validate', hint: '校验全部 agent 定义' },
            { value: 'schema', hint: '打印 agent 定义的 JSON Schema' },
            { value: 'migrate', hint: '迁移旧格式定义' },
            { value: 'help', hint: '用法说明' },
        ],
    },
    effort: {
        title: '思考档位（推理深度）',
        rows: [
            { value: 'auto', hint: '按关键词自动升降档（清除手动档位）' },
            { value: 'off', hint: '不思考（最快）' },
            { value: 'minimal', hint: '最轻量思考' },
            { value: 'low', hint: '轻量思考' },
            { value: 'medium', hint: '中等（默认）' },
            { value: 'high', hint: '深入思考' },
            { value: 'xhigh', hint: '更深' },
            { value: 'max', hint: '最深入（最慢、最贵）' },
            { value: 'probe', hint: '实测当前模型接受哪些档位' },
        ],
    },
    mode: {
        title: 'Kiro 模式',
        rows: [
            { value: 'vibe', hint: '聊天/实现模式（默认）' },
            { value: 'spec', hint: '先确认再开发（配合 /spec 流程）' },
        ],
    },
    engine: {
        title: '引擎组合（loop + 工具引擎整体切换）',
        rows: [
            { value: 'kiro', hint: '自研循环 + Rust 工具引擎（Landlock）' },
            { value: 'kiro -p', hint: '自研循环 + 平台工具管线' },
            { value: 'dsh', hint: 'DSH 平台整套（默认）' },
        ],
    },
    loop: {
        title: '回合驱动器',
        rows: [
            { value: 'dsh', hint: 'DSH 平台 agent loop（完整工具链）' },
            { value: 'kiro', hint: 'dsh-kiro 自研驱动（完整工具循环）' },
        ],
    },
    tools: {
        title: '工具引擎（仅 /loop kiro 生效）',
        rows: [
            { value: 'dsh', hint: '平台工具管线（平台沙箱 + 审批）' },
            { value: 'rust', hint: 'Rust 引擎（Landlock 内核级沙箱）' },
        ],
    },
    context: {
        title: '常载上下文文件（@ 注入）',
        rows: [
            { value: 'show', hint: '显示当前注入的上下文文件' },
            { value: 'add <path>', hint: '加入一个文件或目录', needsArg: true },
            { value: 'remove <path>', hint: '移出上下文', needsArg: true },
            { value: 'clear', hint: '清空全部常载文件' },
            { value: 'help', hint: '用法说明' },
        ],
    },
    knowledge: {
        title: '知识库',
        rows: [
            { value: 'list', hint: '列出知识条目' },
            { value: 'search <query>', hint: '搜索知识库', needsArg: true },
            { value: 'show <id>', hint: '查看一条知识', needsArg: true },
            { value: 'add <path|文本>', hint: '新增一条知识', needsArg: true },
            { value: 'update <id>', hint: '更新一条知识', needsArg: true },
            { value: 'remove <id>', hint: '删除一条知识', needsArg: true },
            { value: 'clear', hint: '清空知识库' },
            { value: 'help', hint: '用法说明' },
        ],
    },
    prompts: {
        title: '提示词库',
        rows: [
            { value: 'list', hint: '列出提示词' },
            { value: 'get <name>', hint: '插入一条提示词', needsArg: true },
            { value: 'details <name>', hint: '查看提示词详情', needsArg: true },
            { value: 'create <name>', hint: '新建提示词', needsArg: true },
            { value: 'edit <name>', hint: '编辑提示词', needsArg: true },
            { value: 'remove <name>', hint: '删除提示词', needsArg: true },
            { value: 'help', hint: '用法说明' },
        ],
    },
    todos: {
        title: '待办清单',
        rows: [
            { value: 'view', hint: '查看清单' },
            { value: 'resume', hint: '继续上次未完成的待办' },
            { value: 'clear-finished', hint: '清除已完成项' },
            { value: 'delete <index>', hint: '删除第 N 项', needsArg: true },
            { value: 'help', hint: '用法说明' },
        ],
    },
    checkpoint: {
        title: '检查点（快照 / 回滚）',
        rows: [
            { value: 'list', hint: '列出快照' },
            { value: 'snapshot', hint: '存一个快照' },
            { value: 'diff', hint: '显示最新改动' },
            { value: 'restore <id>', hint: '回滚到某个快照', needsArg: true },
            { value: 'init', hint: '初始化检查点目录' },
            { value: 'clean', hint: '清理旧快照' },
            { value: 'help', hint: '用法说明' },
        ],
    },
    code: {
        title: '代码索引',
        rows: [
            { value: 'status', hint: '索引状态' },
            { value: 'overview', hint: '仓库概览' },
            { value: 'summary', hint: '生成摘要' },
            { value: 'init', hint: '建立索引' },
            { value: 'logs', hint: '最近索引日志' },
            { value: 'help', hint: '用法说明' },
        ],
    },
    approvals: {
        title: '信任与审批',
        rows: [
            { value: 'remove project-tool <n>', hint: '移除一条整工具信任', needsArg: true },
            { value: 'remove project-pattern <n>', hint: '移除一条项目级命令前缀信任', needsArg: true },
            { value: 'remove session-pattern <n>', hint: '移除一条本次会话的前缀信任', needsArg: true },
            { value: 'help', hint: '用法说明' },
        ],
    },
    experiment: {
        title: '实验特性开关',
        rows: [
            { value: 'knowledge <on|off>', hint: '知识库', needsArg: true },
            { value: 'thinking <on|off>', hint: '思考档位', needsArg: true },
            { value: 'tangent <on|off>', hint: '切线模式', needsArg: true },
            { value: 'todos <on|off>', hint: '待办清单', needsArg: true },
            { value: 'checkpoint <on|off>', hint: '检查点', needsArg: true },
            { value: 'delegate <on|off>', hint: '委派子代理', needsArg: true },
        ],
    },
    paste: {
        title: '超大粘贴落盘文件',
        rows: [
            { value: 'list', hint: '列出落盘文件' },
            { value: 'clean', hint: '清理落盘文件' },
        ],
    },
};
/** Picker for `name`, or undefined when the command takes no enumerated args. */
export function pickerFor(name) {
    return COMMAND_PICKERS[name.toLowerCase()];
}
/** Every command that opens a picker when submitted bare. */
export function pickerCommandNames() {
    return Object.keys(COMMAND_PICKERS);
}
//# sourceMappingURL=subcommands.js.map