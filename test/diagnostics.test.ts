import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseMarkdownDetail } from "../src/parse.ts";

// parseMarkdown stays a string-only wrapper over the detailed API

test("parseMarkdown returns only html (backward compatible)", () => {
    assert.equal(parseMarkdown("# A\n\n**b**"), "<h1>A</h1>\n<p><strong>b</strong></p>");
});

test("clean document produces no issues", () => {
    const r = parseMarkdownDetail("# A\n\nsome text\n\n- item");
    assert.deepEqual(r.issues, []);
});

// -- unclosed fence ------------------------------------------------------------

test("unclosed fence: warning at the opening line", () => {
    const r = parseMarkdownDetail("# T\n\ntext\n\n```\ncode");
    assert.deepEqual(
        r.issues.map((i) => [i.code, i.line, i.severity]),
        [["unclosed-fence", 5, "warning"]],
    );
});

test("closed fence produces no issue", () => {
    const r = parseMarkdownDetail("```\ncode\n```");
    assert.deepEqual(r.issues, []);
});

// -- inline emphasis/code heuristics ---------------------------------------------

test("odd '**' count warns; pairs spanning lines do not", () => {
    const crossLine = parseMarkdownDetail("**bold\ntext**");
    assert.deepEqual(crossLine.issues, []);

    const dangling = parseMarkdownDetail("a **b c");
    assert.equal(dangling.issues.length, 1);
    assert.equal(dangling.issues[0]!.code, "unclosed-bold");
    assert.equal(dangling.issues[0]!.line, 1);
});

test("unpaired backtick warns; code span content ignored", () => {
    const ok = parseMarkdownDetail("a `x **y**` b");
    assert.deepEqual(ok.issues, []);

    const warn = parseMarkdownDetail("a `x b");
    assert.equal(warn.issues[0]!.code, "unclosed-inline-code");
});

test("unpaired backtick across lines warns (spans are single-line)", () => {
    const r = parseMarkdownDetail("a `x\ny` b");
    assert.equal(r.issues[0]!.code, "unclosed-inline-code");
});

test("odd '~~' count warns", () => {
    const r = parseMarkdownDetail("~~s");
    assert.equal(r.issues[0]!.code, "unclosed-strikethrough");
});

test("warning inside a list item reports the item line", () => {
    const r = parseMarkdownDetail("- ok\n- **broken");
    assert.equal(r.issues[0]!.line, 2);
});

// -- heading structure -----------------------------------------------------------

test("heading level jump warns with both levels", () => {
    const r = parseMarkdownDetail("# A\n\n#### B");
    assert.equal(r.issues[0]!.code, "heading-skip");
    assert.match(r.issues[0]!.message, /h1 to h4/);
});

test("sequential or backward heading levels are fine", () => {
    const r = parseMarkdownDetail("# A\n\n## B\n\n### C\n\n## D\n\n# E");
    assert.deepEqual(r.issues, []);
});

test("headings map records level, text and line", () => {
    const r = parseMarkdownDetail("# One\n\ntext\n\n### Two");
    assert.deepEqual(r.headings, [
        { level: 1, text: "One", line: 1 },
        { level: 3, text: "Two", line: 5 },
    ]);
});

// -- list behaviors ---------------------------------------------------------------

test("paragraph interrupting a list is info-level", () => {
    const r = parseMarkdownDetail("- a\n- b\ntext");
    assert.equal(r.issues[0]!.code, "list-interrupted");
    assert.equal(r.issues[0]!.severity, "info");
    assert.equal(r.issues[0]!.line, 3);
});

test("switching list markers mid-list is info-level", () => {
    const r = parseMarkdownDetail("- a\n1. b");
    assert.deepEqual(
        r.issues.map((i) => [i.code, i.severity]),
        [["mixed-list-markers", "info"]],
    );
});

// -- frontmatter -------------------------------------------------------------------

test("frontmatter-shaped document warns once, info-level, at line 1", () => {
    const r = parseMarkdownDetail("---\ntitle: x\n---\n\nhello");
    assert.equal(r.issues.length, 1);
    assert.equal(r.issues[0]!.code, "frontmatter-unsupported");
    assert.equal(r.issues[0]!.severity, "info");
    assert.equal(r.issues[0]!.line, 1);
});

test("a single hr is not frontmatter", () => {
    const r = parseMarkdownDetail("text\n\n---\n");
    assert.deepEqual(r.issues, []);
});

// -- blockquote line offsets --------------------------------------------------------

test("issues inside blockquotes carry absolute line numbers", () => {
    const r = parseMarkdownDetail("one\n\ntwo\n\n> quote with **unclosed");
    assert.equal(r.issues[0]!.code, "unclosed-bold");
    assert.equal(r.issues[0]!.line, 5);
});

// -- stats ---------------------------------------------------------------------------

test("word count covers headings, list items and paragraphs", () => {
    const r = parseMarkdownDetail("# Two words\n\n- three word item\n\nfour words here");
    assert.equal(r.words, 8);
});

test("word count ignores emphasis markers", () => {
    const r = parseMarkdownDetail("**bold** `code` ~~s~~");
    assert.equal(r.words, 3);
});
