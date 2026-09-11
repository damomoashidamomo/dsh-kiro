const MODES = ['vibe', 'spec'];
function isMode(value) {
    return MODES.includes(value);
}
export const modeCommand = {
    name: 'mode',
    description: 'Switch Kiro agent mode: vibe | spec',
    input: { hint: '<vibe|spec>' },
    handler: async ({ rawInput }) => {
        const candidate = rawInput.trim().toLowerCase();
        if (candidate === '' || !isMode(candidate)) {
            return { kind: 'success', text: `usage: /mode <${MODES.join('|')}>` };
        }
        return { kind: 'success', text: `agent mode set to ${candidate}.` };
    },
};
//# sourceMappingURL=mode.js.map