/**
 * Minimal type stub for `cli-highlight`, which ships without declarations.
 */

declare module 'cli-highlight' {
  export interface HighlightOptions {
    language?: string
    ignoreIllegals?: boolean
    theme?: Record<string, Record<string, string>> | undefined
  }

  export function highlight(code: string, options?: HighlightOptions): string
}
