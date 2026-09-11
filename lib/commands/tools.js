/**
 * `/tools` — list every built-in tool, show current trust status, and mutate
 * the trust store (trust / untrust / reset).
 *
 * Implementation note: phase 3 only mutates the TrustStore; the agent's
 * `agent/pre-step` interception that enforces trust lands in phase 4. Until
 * then the store records the user's intent and surfaces it back to them.
 */
import { KIRO_TRUST } from '../trust/index.js';
/** Built-in tool names shipped with DSH (the same ones the agent sees). */
const BUILTIN_TOOLS = [
    'bash', 'pwsh', 'fs', 'fs-search', 'str-replace-editor',
    'skill', 'todo', 'goal', 'web', 'web-search', 'web-fetch',
    'subagent', 'subagent-control', 'subagent-list-agents',
    'workflow', 'ralph', 'jobs',
];
/** Resolve the TrustStore from the invocation's agent context. */
function resolveStore(ctx) {
    return ctx.get(KIRO_TRUST);
}
function formatList(store) {
    const snap = store?.snapshot();
    const trustAll = snap?.trustAll === true;
    const lines = [];
    lines.push('Built-in tools:');
    for (const name of BUILTIN_TOOLS) {
        const trusted = trustAll || snap?.entries[name] !== undefined;
        const marker = trusted ? '✓ trusted' : '  ask    ';
        const entry = snap?.entries[name];
        const reason = entry?.reason !== undefined ? `  (${entry.reason})` : '';
        lines.push(`  ${marker}  ${name}${reason}`);
    }
    if (trustAll)
        lines.push('  trust-all is on (every tool runs without confirmation)');
    return lines.join('\n');
}
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'list', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'list', args: tokens.slice(1) };
}
export const toolsCommand = {
    name: 'tools',
    description: 'View tool trust status; trust/untrust/reset individual tools',
    input: { hint: '<list|trust|untrust|trust-all|reset> [name]' },
    handler: async ({ rawInput }) => {
        const { name: sub, args } = parseSubcommand(rawInput);
        // The store lives on the Cordis context; commands get the agent on the
        // invocation, and the agent's context exposes the global services.
        // We resolve via the registry's ambient context captured at register-time.
        return await runToolsCommand(sub, args);
    },
};
async function runToolsCommand(sub, args) {
    // Resolve the store lazily from the ambient module-level context captured
    // by kiro-trust's apply(). We can't import a singleton easily here, so
    // defer to the store's own import path: read the persisted doc directly.
    const { readTrust, writeTrust } = await import('../trust/store');
    const doc = readTrust();
    switch (sub) {
        case 'list':
        case '':
            return { kind: 'success', text: formatListFromDoc(doc) };
        case 'trust': {
            const tool = args[0];
            if (tool === undefined)
                return { kind: 'success', text: 'usage: /tools trust <name>' };
            const next = {
                ...doc,
                entries: { ...doc.entries, [tool]: { name: tool, grantedAt: Date.now() } },
            };
            writeTrust(next);
            return { kind: 'success', text: `trusted: ${tool}` };
        }
        case 'untrust': {
            const tool = args[0];
            if (tool === undefined)
                return { kind: 'success', text: 'usage: /tools untrust <name>' };
            const { [tool]: _removed, ...rest } = doc.entries;
            void _removed;
            writeTrust({ ...doc, entries: rest });
            return { kind: 'success', text: `untrusted: ${tool}` };
        }
        case 'trust-all':
            writeTrust({ ...doc, trustAll: true });
            return { kind: 'success', text: 'trust-all enabled: every built-in tool will run without confirmation' };
        case 'reset':
            writeTrust({ trustAll: false, entries: {}, version: 1 });
            return { kind: 'success', text: 'trust reset to empty' };
        case 'help':
            return { kind: 'success', text: '/tools <list|trust|untrust|trust-all|reset> [name]' };
        default:
            return { kind: 'success', text: `unknown subcommand: ${sub}. Try /tools help.` };
    }
    // Unreachable — TS narrowing doesn't know switch is exhaustive.
}
function formatListFromDoc(doc) {
    const trustAll = doc.trustAll === true;
    const lines = [];
    lines.push('Built-in tools:');
    for (const name of BUILTIN_TOOLS) {
        const trusted = trustAll || doc.entries[name] !== undefined;
        const marker = trusted ? '✓ trusted' : '  ask    ';
        lines.push(`  ${marker}  ${name}`);
    }
    if (trustAll)
        lines.push('  trust-all is on (every tool runs without confirmation)');
    return lines.join('\n');
}
//# sourceMappingURL=tools.js.map