/**
 * `/knowledge` — BM25 knowledge base management.
 *
 * Backed by the `kiroKnowledge` service (provided by the `kiro-knowledge`
 * Cordis plugin). Entries live under `.kiro/knowledge/index.json` in the
 * working tree; the bodies themselves stay in place (only stats + a preview
 * are persisted, tokens are derived on demand).
 *
 * Subcommands:
 *   add <path> [label]     index one file (or a whole directory, recursively)
 *   list                   show every entry with its 1-based index
 *   search <query>         BM25-ranked hits with snippets and scores
 *   update <ref>           re-read an entry from its source file
 *   remove <ref>           drop one entry (id prefix, index, label, or path)
 *   clear                  wipe the whole knowledge base
 *   help                   usage
 *
 * When the knowledge base is non-empty, the runtime also auto-injects the
 * top BM25 hits for each user message into the model context (RAG).
 */
import { existsSync, statSync } from 'node:fs';
import { relative } from 'node:path';
function parseSubcommand(input) {
    const trimmed = input.trim();
    if (trimmed === '')
        return { name: 'show', args: [] };
    const tokens = trimmed.split(/\s+/u);
    return { name: tokens[0] ?? 'show', args: tokens.slice(1) };
}
/** Resolve `kiroKnowledge` from the agent's context, or fail with a message. */
function resolveService(agentCtx) {
    if (agentCtx === null || typeof agentCtx !== 'object') {
        return { error: 'agent context is not available' };
    }
    const get = agentCtx.get;
    if (typeof get !== 'function') {
        return { error: 'agent context does not expose a get() method' };
    }
    const svc = get.call(agentCtx, 'kiroKnowledge');
    if (svc === undefined) {
        return { error: 'kiroKnowledge service is not mounted (is the kiro-knowledge plugin enabled?)' };
    }
    return svc;
}
/** Relative-to-cwd path for display. */
function displayPath(path) {
    const rel = relative(process.cwd(), path);
    return rel === '' || rel.startsWith('..') ? path : rel;
}
/** Format a byte count compactly. */
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
export const knowledgeCommand = {
    name: 'knowledge',
    description: 'BM25 knowledge base — add, list, search, update, remove, clear',
    input: { hint: '<add|list|search|update|remove|clear> [path|query]' },
    handler: async ({ agent, rawInput }) => {
        const { name: sub, args } = parseSubcommand(rawInput);
        const ctx = agent.ctx;
        const svc = resolveService(ctx);
        if ('error' in svc) {
            return { kind: 'error', text: svc.error };
        }
        switch (sub) {
            case 'show':
            case '': {
                const entries = svc.list();
                if (entries.length === 0) {
                    return {
                        kind: 'success',
                        text: '(knowledge base is empty — add sources with /knowledge add <path>)',
                    };
                }
                const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
                const lines = [
                    `knowledge base: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, ${formatSize(totalSize)}`,
                ];
                for (const entry of entries.slice(0, 8)) {
                    lines.push(`  ${entry.label} — ${displayPath(entry.path)}`);
                }
                if (entries.length > 8)
                    lines.push(`  … and ${entries.length - 8} more (use /knowledge list)`);
                return { kind: 'success', text: lines.join('\n') };
            }
            case 'add': {
                const target = args[0];
                if (target === undefined) {
                    return { kind: 'success', text: 'usage: /knowledge add <file|directory> [label]' };
                }
                if (!existsSync(target)) {
                    return { kind: 'error', text: `knowledge: source not found: ${target}` };
                }
                try {
                    const stat = statSync(target);
                    if (stat.isDirectory()) {
                        const store = svc;
                        const added = store.addDir(target, { labelPrefix: args[1] });
                        return {
                            kind: 'success',
                            text: `indexed ${added.length} file${added.length === 1 ? '' : 's'} from ${displayPath(target)}`,
                        };
                    }
                    const label = args.slice(1).join(' ');
                    svc.addFile(target, label === '' ? undefined : label);
                    return { kind: 'success', text: `indexed ${displayPath(target)}` };
                }
                catch (error) {
                    return {
                        kind: 'error',
                        text: `knowledge: ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
            }
            case 'list': {
                const entries = svc.list();
                if (entries.length === 0) {
                    return { kind: 'success', text: '(knowledge base is empty)' };
                }
                const lines = [];
                const width = String(entries.length).length;
                entries.forEach((entry, index) => {
                    lines.push(`${String(index + 1).padStart(width, ' ')}  ${entry.label}  ${formatSize(entry.size)}  ${displayPath(entry.path)}`);
                });
                return { kind: 'success', text: lines.join('\n') };
            }
            case 'search': {
                const query = args.join(' ');
                if (query === '') {
                    return { kind: 'success', text: 'usage: /knowledge search <query>' };
                }
                const hits = svc.query(query, 5);
                if (hits.length === 0) {
                    return { kind: 'success', text: `no hits for “${query}”` };
                }
                const lines = [`top ${hits.length} hit${hits.length === 1 ? '' : 's'} for “${query}”:`];
                hits.forEach((hit, index) => {
                    const entry = hit.entry;
                    lines.push(`${index + 1}. ${entry.label}  (score ${hit.score.toFixed(3)})`);
                    lines.push(`   ${hit.snippet}`);
                });
                return { kind: 'success', text: lines.join('\n') };
            }
            case 'update': {
                const ref = args[0];
                if (ref === undefined) {
                    return { kind: 'success', text: 'usage: /knowledge update <id|index|label|path>' };
                }
                try {
                    const updated = svc.update(ref);
                    if (updated === undefined) {
                        return { kind: 'error', text: `knowledge: no entry matches “${ref}”` };
                    }
                    const entry = updated;
                    return { kind: 'success', text: `updated ${entry.label} (${displayPath(entry.path)})` };
                }
                catch (error) {
                    return {
                        kind: 'error',
                        text: `knowledge: ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
            }
            case 'remove': {
                const ref = args[0];
                if (ref === undefined) {
                    return { kind: 'success', text: 'usage: /knowledge remove <id|index|label|path>' };
                }
                const removed = svc.remove(ref);
                return removed
                    ? { kind: 'success', text: `removed entry “${ref}”` }
                    : { kind: 'error', text: `knowledge: no entry matches “${ref}”` };
            }
            case 'clear': {
                svc.clear();
                return { kind: 'success', text: 'knowledge base cleared' };
            }
            case 'help':
                return {
                    kind: 'success',
                    text: [
                        '/knowledge add <file|directory> [label]',
                        '/knowledge list',
                        '/knowledge search <query>',
                        '/knowledge update <id|index|label|path>',
                        '/knowledge remove <id|index|label|path>',
                        '/knowledge clear',
                        '',
                        'Non-empty bases auto-inject top BM25 hits into the model context (RAG).',
                    ].join('\n'),
                };
            default:
                return { kind: 'success', text: `unknown subcommand: ${sub}. Try /knowledge help.` };
        }
    },
};
//# sourceMappingURL=knowledge.js.map