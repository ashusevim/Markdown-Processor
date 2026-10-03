/**
 * marcus core parser — Markdown → HTML.
 *
 * Pure module: no I/O, no dependencies. The CLI (`cli.ts`) is a thin wrapper,
 * and library consumers can `import { parseMarkdown }` directly.
 *
 * Architecture note (RESEARCH.md): the line-based state machine below is the
 * carrier for phase 2 diagnostics (line numbers for warnings) and phase 3
 * safe-mode escaping — those phases extend this file, they don't rewrite it.
 */
/**
 * Convert Markdown source to HTML.
 *
 * Block-level constructs (headings, fences, quotes, lists, paragraphs) are
 * detected line by line; inline formatting is applied per text run.
 * Returns a fragment — no <html>/<body> wrapper, ready to embed or pipe.
 */
export declare function parseMarkdown(source: string): string;
