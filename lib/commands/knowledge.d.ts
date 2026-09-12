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
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
export declare const knowledgeCommand: CommandDefinition;
