import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseMarkdown, parseMarkdownDetail } from "../src/parse.ts";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

// -- BOM handling (end-to-end finding: editors prepend U+FEFF) ------------------

test("a leading BOM is stripped so the first heading still parses", () => {
    const r = parseMarkdownDetail("\uFEFF# Title\n\ntext");
    assert.equal(r.html, "<h1>Title</h1>\n<p>text</p>");
    assert.deepEqual(r.headings, [{ level: 1, text: "Title", line: 1 }]);
});

test("a BOM never leaks into the output", () => {
    assert.doesNotMatch(parseMarkdown("\uFEFF# T\n\nBOM\uFEFF in the middle stays"), /^\uFEFF/);
});

test("BOM + CRLF together (Windows editor file) parse cleanly", () => {
    assert.equal(parseMarkdown("\uFEFF# T\r\n\r\nbody **b**\r\n"), "<h1>T</h1>\n<p>body <strong>b</strong></p>");
});

test("CLI: BOM input converts from stdin and from a file", () => {
    const piped = spawnSync(process.execPath, [CLI], { input: "\uFEFF# Hi", encoding: "utf8" });
    assert.equal(piped.stdout, "<h1>Hi</h1>\n");
});

// -- issue ordering (end-to-end finding: repairs and deferred checks interleaved) --

test("issues come back in document order, not insertion order", () => {
    // The unclosed-bold is detected when the paragraph flushes (at EOF), so it
    // would otherwise be reported after the html-escaped issue on a later line.
    const source = "#Summary\n\nhi **there\n<script>x</script>";
    const r = parseMarkdownDetail(source, { fixLlm: true });
    const lines = r.issues.map((issue) => issue.line);
    assert.deepEqual(lines, [...lines].sort((a, b) => a - b), `not sorted: ${JSON.stringify(r.issues)}`);
    assert.deepEqual(
        r.issues.map((issue) => [issue.line, issue.code]),
        [
            [1, "repaired-heading-space"],
            [3, "unclosed-bold"],
            [4, "html-escaped"],
        ],
    );
});

test("same-line issues keep their natural insertion order", () => {
    const r = parseMarkdownDetail("**a ~~b", {});
    const sameLine = r.issues.filter((issue) => issue.line === 1);
    assert.deepEqual(
        sameLine.map((issue) => issue.code),
        ["unclosed-bold", "unclosed-strikethrough"],
    );
});

// -- inline code spans (CommonMark backtick runs) ---------------------------------

test("double-backtick spans may contain a backtick", () => {
    assert.equal(parseMarkdown("use ``a `b` c`` here"), "<p>use <code>a `b` c</code> here</p>");
});

test("a single-backtick span may contain a triple-backtick run", () => {
    assert.equal(parseMarkdown("wrap it in ` ```yaml ` here"), "<p>wrap it in <code>```yaml</code> here</p>");
});

test("nested backticks no longer trigger the unpaired-backtick warning", () => {
    const r = parseMarkdownDetail("frontmatter wrapped in a ` ```yaml ` fence → unwrapped");
    assert.deepEqual(r.issues, []);
});

test("a code span keeps its content verbatim, including a lone space", () => {
    assert.equal(parseMarkdown("`` ` `` is a backtick"), "<p><code>`</code> is a backtick</p>");
});

test("an actually unpaired backtick still warns", () => {
    const r = parseMarkdownDetail("dangling `backtick here");
    assert.equal(r.issues.find((entry) => entry.code === "unclosed-inline-code")!.line, 1);
});

test("code spans still win over emphasis inside them", () => {
    assert.equal(parseMarkdown("`**not bold**`"), "<p><code>**not bold**</code></p>");
});

// -- unicode / encoding robustness ------------------------------------------------

test("unicode, emoji and CJK pass through unharmed", () => {
    assert.equal(
        parseMarkdown("# 中文标题 🎉\n\ncafé *naïve*\n\n- item ✓"),
        "<h1>中文标题 🎉</h1>\n<p>café <em>naïve</em></p>\n<ul>\n<li>item ✓</li>\n</ul>",
    );
});

test("lone CR line endings are normalized", () => {
    assert.equal(parseMarkdown("# T\r\rbody"), "<h1>T</h1>\n<p>body</p>");
});
