/**
 * dsh-kiro keybinding catalogue. Exposes named actions so the Ink renderer
 * can dispatch a uniform shape, and the test suite can simulate keys
 * without coupling to actual `useInput` calls.
 *
 * @module @damomoashidamomo/dsh-kiro/runtime/keybindings
 */
/** Map a raw key event to a high-level action, or `undefined` to let the
 * prompt input handle it (e.g. printable characters, navigation). */
export function mapKey(event) {
    const { input, key } = event;
    // Modifier-prefixed shortcuts.
    if (key.ctrl) {
        if (input === 'c')
            return 'interrupt';
        if (input === 'd')
            return 'quit';
        if (input === 'k')
            return 'open-slash-menu';
        if (input === 't')
            return 'toggle-tangent';
        if (input === 'l')
            return 'clear-screen';
        if (input === 'g')
            return 'cancel-pending';
        if (input === 'p')
            return 'history-prev';
        if (input === 'n')
            return 'history-next';
        if (input === 'r')
            return 'history-prev';
        if (input === 'o')
            return 'open-context-picker';
        return undefined;
    }
    if (key.meta) {
        if (input === 'k')
            return 'open-slash-menu';
        return undefined;
    }
    if (key.shift) {
        if (key.tab)
            return 'toggle-plan';
        if (input === 'Tab')
            return 'toggle-plan';
        return undefined;
    }
    // Special keys without modifier.
    if (key.escape)
        return 'cancel-pending';
    if (key.return)
        return 'submit';
    if (key.upArrow)
        return 'history-prev';
    if (key.downArrow)
        return 'history-next';
    if (key.tab)
        return 'auto-complete';
    if (key.pageUp)
        return 'scroll-up';
    if (key.pageDown)
        return 'scroll-down';
    if (key.leftArrow || key.rightArrow)
        return undefined;
    return undefined;
}
/** Default chord display for documentation purposes. */
export const CHEAT_SHEET = [
    ['Enter', 'submit', '提交输入'],
    ['Shift+Enter', 'newline', '插入换行(多行输入)'],
    ['Ctrl+C', 'interrupt', '中断当前 turn'],
    ['Ctrl+D', 'quit', '退出 TUI'],
    ['Ctrl+K', 'open-slash-menu', '打开 slash 命令模糊搜索'],
    ['Ctrl+L', 'clear-screen', '清屏'],
    ['Ctrl+O', 'open-context-picker', '添加上下文文件'],
    ['Ctrl+T', 'toggle-tangent', '切换 tangent 模式'],
    ['Shift+Tab', 'toggle-plan', '切换 plan 模式'],
    ['↑ / ↓', 'history-prev', '浏览输入历史'],
    ['Tab', 'auto-complete', '接受补全'],
    ['Esc', 'cancel-pending', '取消当前操作'],
    ['! 前缀', 'shell-command', '直接执行 shell'],
    ['@ 前缀', 'auto-complete', '引用 prompt 或 MCP 工具'],
];
//# sourceMappingURL=keybindings.js.map