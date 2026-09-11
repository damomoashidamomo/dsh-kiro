const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
function isEffort(value) {
    return EFFORTS.includes(value);
}
export const effortCommand = {
    name: 'effort',
    description: 'Set reasoning-effort: low | medium | high | xhigh | max',
    input: { hint: '<level>' },
    handler: async ({ rawInput }) => {
        const candidate = rawInput.trim().toLowerCase();
        if (candidate === '' || !isEffort(candidate)) {
            return {
                kind: 'success',
                text: [
                    `usage: /effort <${EFFORTS.join('|')}>`,
                    `current levels: low, medium, high, xhigh, max`,
                ].join('\n'),
            };
        }
        return { kind: 'success', text: `reasoning effort set to ${candidate}.` };
    },
};
//# sourceMappingURL=effort.js.map