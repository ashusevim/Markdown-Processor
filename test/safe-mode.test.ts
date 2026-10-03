import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseMarkdown, parseMarkdownDetail } from "../src/parse.ts";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

// -- parser: safe mode (the default) ------------------------------------------

test("safe by default: block-level raw HTML is escaped into a paragraph", () => {
    assert.equal(parseMarkdown("<div class=x>raw</div>"), "<p>&lt;div class=x&gt;raw&lt;/div&gt;</p>");
});

test("safe by default: script tags cannot execute", () => {
    const r = parseMarkdownDetail("hello <script>alert(1)</script> world");
    assert.equal(r.html, "<p>hello &lt;script&gt;alert(1)&lt;/script&gt; world</p>");
    assert.equal(r.issues.length, 0); // inline HTML escapes silently; block-level lines report
});

test("safe by default: HTML inside headings and list items is escaped", () => {
    assert.equal(parseMarkdown("# T <img src=x onerror=y>"), "<h1>T &lt;img src=x onerror=y&gt;</h1>");
    assert.equal(parseMarkdown("- <b>x</b>"), "<ul>\n<li>&lt;b&gt;x&lt;/b&gt;</li>\n</ul>");
});

test("safe by default: block-level HTML lines report html-escaped info with line", () => {
    const r = parseMarkdownDetail("text\n\n<style>body{}</style>");
    const issue = r.issues.find((entry) => entry.code === "html-escaped")!;
    assert.equal(issue.severity, "info");
    assert.equal(issue.line, 3);
});

test("safe by default: angle autolinks still work (markdown syntax, not HTML)", () => {
    assert.equal(
        parseMarkdown("see <https://ex.com/x>"),
        '<p>see <a href="https://ex.com/x">https://ex.com/x</a></p>',
    );
});

test("safe by default: existing entities preserved, bare & completed", () => {
    assert.equal(parseMarkdown("a &lt;b&gt; and AT&T"), "<p>a &lt;b&gt; and AT&amp;T</p>");
});

test("safe by default: markdown formatting still works around escaped HTML", () => {
    assert.equal(
        parseMarkdown("**bold** <i>raw</i> `c`"),
        "<p><strong>bold</strong> &lt;i&gt;raw&lt;/i&gt; <code>c</code></p>",
    );
});

test("safe by default: HTML inside blockquotes is escaped too", () => {
    assert.equal(parseMarkdown("> <em>q</em>"), "<blockquote>\n<p>&lt;em&gt;q&lt;/em&gt;</p>\n</blockquote>");
});

// -- parser: unsafe mode (trusted input) ----------------------------------------

test("unsafeHtml: block HTML passes through verbatim", () => {
    assert.equal(parseMarkdown("<div class=x>raw</div>", { unsafeHtml: true }), "<div class=x>raw</div>");
});

test("unsafeHtml: inline HTML in paragraphs passes through", () => {
    assert.equal(parseMarkdown("**b** <i>raw</i>", { unsafeHtml: true }), "<p><strong>b</strong> <i>raw</i></p>");
});

test("unsafeHtml: no html-escaped issues", () => {
    const r = parseMarkdownDetail("<div>x</div>", { unsafeHtml: true });
    assert.deepEqual(r.issues, []);
});

// -- CLI ------------------------------------------------------------------------

test("CLI default escapes raw HTML and reports it on stderr", () => {
    const r = spawnSync(process.execPath, [CLI], { input: "<div>x</div>", encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "<p>&lt;div&gt;x&lt;/div&gt;</p>");
    assert.match(r.stderr, /info \[html-escaped\]/);
});

test("CLI --unsafe restores passthrough without noise", () => {
    const r = spawnSync(process.execPath, [CLI, "--unsafe"], { input: "<div>x</div>", encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "<div>x</div>");
    assert.equal(r.stderr, "");
});

test("CLI --report json counts html-escaped as info, not warning", () => {
    const r = spawnSync(process.execPath, [CLI, "--report", "json"], {
        input: "<div>x</div>",
        encoding: "utf8",
    });
    const report = JSON.parse(r.stdout) as { stats: { infos: number; warnings: number } };
    assert.equal(report.stats.infos, 1);
    assert.equal(report.stats.warnings, 0);
});

test("info-level html-escaped never fails --strict", () => {
    const r = spawnSync(process.execPath, [CLI, "--strict"], { input: "<div>x</div>", encoding: "utf8" });
    assert.equal(r.status, 0);
});
