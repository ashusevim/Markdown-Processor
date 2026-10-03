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
export type IssueCode = "unclosed-fence" | "unclosed-inline-code" | "unclosed-bold" | "unclosed-strikethrough" | "heading-skip" | "list-interrupted" | "mixed-list-markers" | "frontmatter-unsupported";
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
/** Backward-compatible entry point: HTML only, diagnostics discarded. */
export declare function parseMarkdown(source: string): string;
/** Full entry point: HTML plus issues, heading map and word count. */
export declare function parseMarkdownDetail(source: string): ParseResult;
