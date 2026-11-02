export const changelogCommand = {
    name: 'changelog',
    description: 'Show the latest dsh-kiro changes',
    handler: async () => {
        return {
            kind: 'success',
            text: [
                'dsh-kiro changelog:',
                '  0.5.x  链接可点击与防闪烁：',
                '        - 回答里的链接 Ctrl+点击 直达（OSC 8；修复 Ink 依赖拆坏超链接）',
                '        - 流式输出按块沉入 Static：空闲 0 重绘，长回答不再整屏闪烁',
                '        - 修复回答渲染两遍（流式副本 + durable 副本叠加）',
                '        - /paste list|clean 管理落盘粘贴文件',
                '  0.4.x  习惯驱动改善（基于 96 个 kiro 会话分析）：',
                '        - 巨量粘贴自动落盘 .kiro/paste 并以 @ 引用（P2）',
                '        - 上下文 60%/80% 阈值提醒 + 用量条变色（P3）',
                '        - README 头与 .kiro/skills 注入（kiro 常载对齐，P4）',
                '        - 状态栏首字延迟（P8）',
                '        - 内置变更护栏：生产/仓库外配置改动先确认（P11）',
                '        - /effort 真实化 + auto/关键词自动升档（深入分析/ultrathink）',
                '        - 用量读数改用 token-meter 投影（真实增长）；移除状态栏进度条',
                '        - 粒度化信任：审批可按 整工具/仅此命令/命令前缀 记住（/approvals 管理）',
                '        - 状态栏显示工作区 📁 与权限徽章 [只读/工作区/完全]',
                '  0.3.x  kiro 差距补齐：@文件补全 / steering 注入 / 审批 diff /',
                '        todo 清单 / hooks 与 steering 热重载 / 审批项目级持久化',
                '  0.1.0  initial release — phase 1 skeleton + phase 2 interaction + phase 3 commands',
                '        https://github.com/damomoashidamomo/dsh-kiro/releases',
            ].join('\n'),
        };
    },
};
//# sourceMappingURL=changelog.js.map