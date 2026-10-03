import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseMarkdownDetail } from "../src/parse.ts";

const TABLE_2COL = "<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>";

// -- basic structure -------------------------------------------------------------

test("basic pipe table renders thead + tbody", () => {
    assert.equal(parseMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |"), TABLE_2COL);
});

test("outer pipes are optional", () => {
    assert.equal(parseMarkdown("a | b\n--- | ---\n1 | 2"), TABLE_2COL);
});

test("a header with no body rows still renders thead only", () => {
    assert.equal(
        parseMarkdown("| a | b |\n| --- | --- |"),
        "<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n</table>",
    );
});

test("empty cells are preserved", () => {
    assert.equal(
        parseMarkdown("| | b |\n| --- | --- |\n| | |"),
        "<table>\n<thead>\n<tr>\n<th></th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td></td>\n<td></td>\n</tr>\n</tbody>\n</table>",
    );
});

// -- alignment --------------------------------------------------------------------

test("alignment markers map to text-align styles", () => {
    const html = parseMarkdown("| l | c | r | d |\n| :-- | :-: | --: | --- |\n| 1 | 2 | 3 | 4 |");
    assert.match(html, /<th style="text-align: left">l<\/th>/);
    assert.match(html, /<th style="text-align: center">c<\/th>/);
    assert.match(html, /<th style="text-align: right">r<\/th>/);
    assert.match(html, /<th>d<\/th>/); // no marker -> no style attribute
    assert.match(html, /<td style="text-align: left">1<\/td>/);
    assert.match(html, /<td style="text-align: right">3<\/td>/);
});

// -- inline content ---------------------------------------------------------------

test("cell content goes through full inline processing", () => {
    const html = parseMarkdown("| **b** | `c` |\n| --- | --- |\n| [l](https://e.com) | ~~s~~ |");
    assert.match(html, /<th><strong>b<\/strong><\/th>/);
    assert.match(html, /<th><code>c<\/code><\/th>/);
    assert.match(html, /<td><a href="https:\/\/e\.com">l<\/a><\/td>/);
    assert.match(html, /<td><del>s<\/del><\/td>/);
});

test("escaped pipes stay inside their cell and do not split it", () => {
    assert.equal(
        parseMarkdown("| a \\| b | c |\n| --- | --- |\n| x | y |"),
        "<table>\n<thead>\n<tr>\n<th>a | b</th>\n<th>c</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>x</td>\n<td>y</td>\n</tr>\n</tbody>\n</table>",
    );
});

test("safe mode escapes HTML inside cells; --unsafe passes it through", () => {
    const source = "| <b>x</b> | y |\n| --- | --- |";
    assert.match(parseMarkdown(source), /<th>&lt;b&gt;x&lt;\/b&gt;<\/th>/);
    assert.match(parseMarkdown(source, { unsafeHtml: true }), /<th><b>x<\/b><\/th>/);
});

// -- ragged rows -------------------------------------------------------------------

test("a row with extra cells drops them and warns at that line", () => {
    const r = parseMarkdownDetail("| a | b |\n| --- | --- |\n| 1 | 2 | 3 |");
    assert.match(r.html, /<td>1<\/td>\n<td>2<\/td>/);
    assert.doesNotMatch(r.html, /<td>3<\/td>/);
    const issue = r.issues.find((entry) => entry.code === "table-ragged")!;
    assert.equal(issue.severity, "warning");
    assert.equal(issue.line, 3);
});

test("a row with too few cells is padded, not warned", () => {
    const r = parseMarkdownDetail("| a | b |\n| --- | --- |\n| 1 |");
    assert.match(r.html, /<td>1<\/td>\n<td><\/td>/);
    assert.deepEqual(r.issues, []);
});

test("table cell words count toward the document total", () => {
    assert.equal(parseMarkdownDetail("| one two | three |\n| --- | --- |\n| four | five |").words, 5);
});

test("markdown markers inside code spans in cells do not warn", () => {
    // Regression: documenting markdown ("use `**` for bold") used to report an
    // unclosed bold, because the code span wasn't stripped before counting.
    const r = parseMarkdownDetail("| a | b |\n| --- | --- |\n| `**` | `~~` |");
    assert.deepEqual(r.issues, []);
    assert.match(r.html, /<td><code>\*\*<\/code><\/td>/);
});

test("genuinely unclosed bold in a cell still warns", () => {
    const r = parseMarkdownDetail("| a | b |\n| --- | --- |\n| **dangling | x |");
    assert.equal(r.issues.find((entry) => entry.code === "unclosed-bold")!.line, 3);
});

// -- boundaries: what must NOT become a table ------------------------------------------

test("a bare '---' stays a thematic break (single column needs a pipe)", () => {
    assert.equal(parseMarkdown("a\n\n---"), "<p>a</p>\n<hr>");
});

test("a pipe row followed by a non-delimiter line stays a paragraph", () => {
    assert.equal(parseMarkdown("| a | b |\n| x | y |"), "<p>| a | b |\n| x | y |</p>");
});

test("a delimiter row without a pipe is not a table delimiter", () => {
    assert.equal(parseMarkdown("| a |\n---"), "<p>| a |</p>\n<hr>");
});

test("a list item containing pipes is still a list item", () => {
    // The list branch runs before the table branch, so this can never become a
    // table header — and a delimiter-looking line with no header above it is
    // ordinary paragraph text, not a thematic break.
    const r = parseMarkdownDetail("- a | b\n--- | ---");
    assert.doesNotMatch(r.html, /<table>/);
    assert.equal(r.html, "<ul>\n<li>a | b</li>\n</ul>\n<p>--- | ---</p>");
});

test("tables end at a blank line, a list, or a heading", () => {
    assert.match(parseMarkdown("| a |\n| --- |\n| 1 |\n\ntext"), /<\/table>\n<p>text<\/p>/);
    assert.match(parseMarkdown("| a |\n| --- |\n| 1 |\n- item"), /<\/table>\n<ul>\n<li>item<\/li>\n<\/ul>/);
    assert.match(parseMarkdown("| a |\n| --- |\n| 1 |\n# h"), /<\/table>\n<h1>h<\/h1>/);
});

test("a table inside a blockquote is parsed recursively", () => {
    const html = parseMarkdown("> | a |\n> | --- |\n> | 1 |");
    assert.match(html, /^<blockquote>\n<table>/);
    assert.match(html, /<\/table>\n<\/blockquote>$/);
});

// -- fix-llm: delimiter row with the wrong column count --------------------------------

test("fix-llm: a short delimiter row is resized so the table renders", () => {
    const source = "| a | b | c |\n| --- |\n| 1 | 2 | 3 |";
    const plain = parseMarkdownDetail(source);
    assert.doesNotMatch(plain.html, /<table>/); // without the flag: not a table
    const fixed = parseMarkdownDetail(source, { fixLlm: true });
    assert.match(fixed.html, /<table>/);
    assert.match(fixed.html, /<th>c<\/th>/);
    const repair = fixed.issues.find((entry) => entry.code === "repaired-table-delimiter")!;
    assert.equal(repair.severity, "info");
    assert.equal(repair.line, 2);
});

test("fix-llm: a long delimiter row is truncated to the header width", () => {
    const r = parseMarkdownDetail("| a |\n| --- | --- | --- |\n| 1 |", { fixLlm: true });
    assert.match(r.html, /<table>/);
    assert.equal(r.issues.filter((entry) => entry.code === "repaired-table-delimiter").length, 1);
});

test("fix-llm: a matching delimiter row is left alone", () => {
    const r = parseMarkdownDetail("| a | b |\n| --- | --- |\n| 1 | 2 |", { fixLlm: true });
    assert.deepEqual(r.issues, []);
});

test("fix-llm: delimiter rows inside fences are never touched", () => {
    const r = parseMarkdownDetail("```\n| a | b |\n| --- |\n```", { fixLlm: true });
    assert.deepEqual(r.issues, []);
});
