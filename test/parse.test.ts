import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../src/parse.ts";

// -- headings ----------------------------------------------------------------

test("headings h1 through h6", () => {
    assert.equal(parseMarkdown("# A"), "<h1>A</h1>");
    assert.equal(parseMarkdown("###### F"), "<h6>F</h6>");
});

test("heading with closing hashes strips them", () => {
    assert.equal(parseMarkdown("## Title ##"), "<h2>Title</h2>");
});

test("heading content receives inline formatting", () => {
    assert.equal(parseMarkdown("# **Bold** title"), "<h1><strong>Bold</strong> title</h1>");
});

test("heading without space is a paragraph, not a heading", () => {
    assert.equal(parseMarkdown("#NotHeading"), "<p>#NotHeading</p>");
});

// -- thematic break ------------------------------------------------------------

test("thematic breaks: ---, ***, - - -", () => {
    assert.equal(parseMarkdown("---"), "<hr>");
    assert.equal(parseMarkdown("***"), "<hr>");
    assert.equal(parseMarkdown("- - -"), "<hr>");
});

// -- paragraphs ------------------------------------------------------------------

test("single line is wrapped in a paragraph", () => {
    assert.equal(parseMarkdown("hello"), "<p>hello</p>");
});

test("consecutive lines form one paragraph; blanks separate paragraphs", () => {
    assert.equal(
        parseMarkdown("one\ntwo\n\nthree"),
        "<p>one\ntwo</p>\n<p>three</p>",
    );
});

// -- inline formatting -------------------------------------------------------------

test("bold with ** and __", () => {
    assert.equal(parseMarkdown("**a** __b__"), "<p><strong>a</strong> <strong>b</strong></p>");
});

test("italic with * and _", () => {
    assert.equal(parseMarkdown("*a* _b_"), "<p><em>a</em> <em>b</em></p>");
});

test("bold italic ***", () => {
    assert.equal(parseMarkdown("***x***"), "<p><strong><em>x</em></strong></p>");
});

test("strikethrough", () => {
    assert.equal(parseMarkdown("~~gone~~"), "<p><del>gone</del></p>");
});

test("snake_case words are not italicized", () => {
    assert.equal(parseMarkdown("my_func_and_more"), "<p>my_func_and_more</p>");
});

test("code span escapes HTML and ignores formatting inside", () => {
    assert.equal(parseMarkdown("a `x <b> **y**` b"), "<p>a <code>x &lt;b&gt; **y**</code> b</p>");
});

test("links convert to anchors", () => {
    assert.equal(
        parseMarkdown("see [docs](https://ex.com/guide)"),
        '<p>see <a href="https://ex.com/guide">docs</a></p>',
    );
});

test("links with titles", () => {
    assert.equal(
        parseMarkdown('[docs](https://ex.com "The Docs")'),
        '<p><a href="https://ex.com" title="The Docs">docs</a></p>',
    );
});

test("link hrefs with underscores stay untouched", () => {
    assert.equal(
        parseMarkdown("[x](https://ex.com/a_b_c)"),
        '<p><a href="https://ex.com/a_b_c">x</a></p>',
    );
});

test("images convert to img tags", () => {
    assert.equal(
        parseMarkdown("![alt text](/img.png)"),
        '<p><img src="/img.png" alt="alt text"></p>',
    );
});

test("angle autolinks become anchors", () => {
    assert.equal(
        parseMarkdown("go to <https://ex.com/x>"),
        '<p>go to <a href="https://ex.com/x">https://ex.com/x</a></p>',
    );
});

// -- lists ------------------------------------------------------------------------

test("unordered list", () => {
    assert.equal(parseMarkdown("- a\n- b"), "<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
});

test("ordered list with . and ) markers", () => {
    assert.equal(parseMarkdown("1. a\n2. b"), "<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
    assert.equal(parseMarkdown("1) a"), "<ol>\n<li>a</li>\n</ol>");
});

test("regression: paragraph after list closes ul, not li", () => {
    assert.equal(
        parseMarkdown("- a\n- b\npara"),
        "<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p>para</p>",
    );
});

test("switching list types closes the previous list", () => {
    assert.equal(
        parseMarkdown("- a\n1. b"),
        "<ul>\n<li>a</li>\n</ul>\n<ol>\n<li>b</li>\n</ol>",
    );
});

test("list items receive inline formatting", () => {
    assert.equal(parseMarkdown("- **b** and `c`"), "<ul>\n<li><strong>b</strong> and <code>c</code></li>\n</ul>");
});

test("blank line inside a list keeps it open", () => {
    assert.equal(
        parseMarkdown("- a\n\n- b"),
        "<ul>\n<li>a</li>\n<li>b</li>\n</ul>",
    );
});

// -- code fences -------------------------------------------------------------------

test("fenced code block with language and HTML escaping", () => {
    assert.equal(
        parseMarkdown("```js\nconst a = \"<b>\";\n```"),
        '<pre><code class="language-js">const a = "&lt;b&gt;";\n</code></pre>',
    );
});

test("tilde fences work", () => {
    assert.equal(parseMarkdown("~~~\ncode\n~~~"), "<pre><code>code\n</code></pre>");
});

test("unclosed fence is implicitly closed at end of input", () => {
    assert.equal(parseMarkdown("```\ncode"), "<pre><code>code\n</code></pre>");
});

test("markdown syntax inside a fence is left alone", () => {
    assert.equal(parseMarkdown("```\n**not bold**\n```"), "<pre><code>**not bold**\n</code></pre>");
});

// -- blockquotes ---------------------------------------------------------------------

test("single-line blockquote", () => {
    assert.equal(parseMarkdown("> quote"), "<blockquote>\n<p>quote</p>\n</blockquote>");
});

test("consecutive quote lines form one blockquote", () => {
    assert.equal(
        parseMarkdown("> one\n> two"),
        "<blockquote>\n<p>one\ntwo</p>\n</blockquote>",
    );
});

test("blockquote content is parsed recursively", () => {
    assert.equal(
        parseMarkdown("> ## Head\n> - item"),
        "<blockquote>\n<h2>Head</h2>\n<ul>\n<li>item</li>\n</ul>\n</blockquote>",
    );
});

// -- raw HTML passthrough ---------------------------------------------------------------

test("raw HTML lines pass through without inline processing", () => {
    assert.equal(parseMarkdown("<div class=x>raw</div>"), "<div class=x>raw</div>");
});

// -- normalization -----------------------------------------------------------------------

test("CRLF input is normalized", () => {
    assert.equal(parseMarkdown("# A\r\n\r\npara\r\n"), "<h1>A</h1>\n<p>para</p>");
});

test("empty input yields empty output", () => {
    assert.equal(parseMarkdown(""), "");
});
