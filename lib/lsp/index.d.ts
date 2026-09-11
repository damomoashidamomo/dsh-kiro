/**
 * kiro-lsp — placeholder plugin. Phase 5 implements the LSP client pool
 * (typescript-language-server / pyright / rust-analyzer / gopls / jdtls /
 * solargraph / clangd / kotlin-language-server) and the `code` tool surface
 * with search_symbols / find_references / goto_definition / get_diagnostics /
 * rename_symbol / pattern_search / pattern_rewrite.
 *
 * @module @damomoashidamomo/dsh-kiro/lsp
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "kiro-lsp";
/** Mount the placeholder plugin. */
export declare function apply(ctx: Context): void;
