import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseMarkdownDetail } from "../src/parse.ts";

// -- nesting -----------------------------------------------------------------------

test("one level of nesting", () => {
    assert.equal(parseMarkdown("- a\n  - b"), "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul></li>\n</ul>");
});

test("two levels of nesting", () => {
    assert.equal(
        parseMarkdown("- a\n  - b\n    - c"),
        "<ul>\n<li>a\n<ul>\n<li>b\n<ul>\n<li>c</li>\n</ul></li>\n</ul></li>\n</ul>",
    );
});

test("an ordered list nested in an unordered one", () => {
    assert.equal(parseMarkdown("- a\n  1. b"), "<ul>\n<li>a\n<ol>\n<li>b</li>\n</ol></li>\n</ul>");
});

test("a sibling item after a nested block stays at the outer level", () => {
    assert.equal(
        parseMarkdown("- a\n  - b\n- c"),
        "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul></li>\n<li>c</li>\n</ul>",
    );
});

test("a less-indented item is a sibling, not a child", () => {
    assert.equal(parseMarkdown("- a\n - b"), "<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
});

test("four-space indentation still nests", () => {
    assert.equal(parseMarkdown("- a\n    - b"), "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul></li>\n</ul>");
});

test("content indented 4+ spaces past the content column stays literal text", () => {
    // CommonMark reads 4+ extra spaces as an indented code block. We don't
    // support those, so the line degrades to plain text instead of nesting.
    const html = parseMarkdown("- a\n      - b");
    assert.equal(html, "<ul>\n<li>a\n    - b</li>\n</ul>");
    assert.equal(html.match(/<ul>/g)?.length, 1); // no nested list was created
});

// -- nested task lists ----------------------------------------------------------------

test("task markers work on nested items and set the class on both lists", () => {
    const html = parseMarkdown("- [ ] a\n  - [x] b");
    assert.equal(
        html,
        '<ul class="contains-task-list">\n' +
            '<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled> a\n' +
            '<ul class="contains-task-list">\n' +
            '<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" checked disabled> b</li>\n' +
            "</ul></li>\n</ul>",
    );
});

// -- other blocks inside items --------------------------------------------------------

test("an indented fence inside an item renders a code block", () => {
    assert.equal(
        parseMarkdown("- item\n\n  ```js\n  const x = 1;\n  ```"),
        '<ul>\n<li>item\n<pre><code class="language-js">const x = 1;\n</code></pre></li>\n</ul>',
    );
});

test("an indented blockquote inside an item is parsed recursively", () => {
    assert.equal(
        parseMarkdown("- item\n  > quoted"),
        "<ul>\n<li>item\n<blockquote>\n<p>quoted</p>\n</blockquote></li>\n</ul>",
    );
});

test("a nested list inside a blockquote nests too", () => {
    assert.equal(
        parseMarkdown("> - a\n>   - b"),
        "<blockquote>\n<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul></li>\n</ul>\n</blockquote>",
    );
});

// -- tightness and words -----------------------------------------------------------------

test("a simple item stays tight (no <p> inside <li>)", () => {
    assert.equal(parseMarkdown("- a\n- b"), "<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
});

test("a loose item (blank line inside) wraps later paragraphs in <p>", () => {
    assert.equal(parseMarkdown("- a\n\n  b"), "<ul>\n<li>a\n<p>b</p></li>\n</ul>");
});

test("words inside nested items and blockquotes are counted", () => {
    assert.equal(parseMarkdownDetail("- one two\n  - three").words, 3);
    assert.equal(parseMarkdownDetail("> quoted words here").words, 3);
});

test("an unclosed marker inside a nested item is reported at its absolute line", () => {
    const r = parseMarkdownDetail("- parent\n  - child **dangling");
    const issue = r.issues.find((entry) => entry.code === "unclosed-bold")!;
    assert.equal(issue.line, 2);
    assert.equal(issue.severity, "warning");
});

test("a task marker inside a nested item does not count as a word", () => {
    assert.equal(parseMarkdownDetail("- [x] one\n  - [ ] two").words, 2);
});
