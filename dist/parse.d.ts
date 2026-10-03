/**
 * marcus core parser — Markdown → HTML with diagnostics.
 *
 * Pure module: no I/O, no dependencies. The CLI (`cli.ts`) is a thin wrapper,
 * and library consumers can import either entry point:
 *
 *   parseMarkdown(source)        → html string (backward compatible)
 *   parseMarkdownDetail(source)  → { html, issues, headings, words }
 *
 * marcus's differentiator (RESEARCH.md): unlike every other converter, it
 * tells you the truth about your input — render-affecting problems come back
 * as line-numbered issues instead of silently wrong HTML.
 *
 * Issue severities:
 *   warning — output probably doesn't match the author's intent; --strict fails on these
 *   info    — deliberate repairs or unsupported-syntax notices; never blocks --strict
 */
export type IssueSeverity = "warning" | "info";
export type IssueCode = "unclosed-fence" | "unclosed-inline-code" | "unclosed-bold" | "unclosed-strikethrough" | "heading-skip" | "list-interrupted" | "mixed-list-markers" | "frontmatter-unsupported" | "html-escaped" | "table-ragged" | "repaired-frontmatter-fence" | "repaired-heading-space" | "repaired-proved-block" | "repaired-table-delimiter";
export interface Issue {
    /** 1-based source line where the issue was detected. */
    line: number;
    code: IssueCode;
    severity: IssueSeverity;
    message: string;
}
export interface HeadingRef {
    level: number;
    /** Raw heading text (inline markers not stripped). */
    text: string;
    /** 1-based source line. */
    line: number;
}
export interface ParseResult {
    html: string;
    issues: Issue[];
    headings: HeadingRef[];
    words: number;
}
/** Options for the parse entry points. */
export interface ParseOptions {
    /**
     * When true, raw HTML passes through unescaped (for trusted input).
     * Default: false — raw HTML is escaped to visible text (safe mode).
     */
    unsafeHtml?: boolean;
    /**
     * When true, common LLM-output artifacts are repaired before parsing and
     * every repair is logged as an info issue with a `repaired-*` code
     * (RESEARCH.md §2.3). Default: false — artifacts render as-is.
     */
    fixLlm?: boolean;
}
/** HTML-only entry point: diagnostics discarded. */
export declare function parseMarkdown(source: string, options?: ParseOptions): string;
/** Full entry point: HTML plus issues, heading map and word count. */
export declare function parseMarkdownDetail(source: string, options?: ParseOptions): ParseResult;
