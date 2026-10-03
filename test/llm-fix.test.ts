import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseMarkdownDetail } from "../src/parse.ts";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function fix(source: string) {
    return parseMarkdownDetail(source, { fixLlm: true });
}

// -- heading space repair --------------------------------------------------------

test("fix-llm: '#Heading' gets its space back and renders as a heading", () => {
    const r = fix("# Title\n##Sub\n######Deep");
    assert.equal(r.html, "<h1>Title</h1>\n<h2>Sub</h2>\n<h6>Deep</h6>");
    assert.deepEqual(
        r.issues.map((issue) => [issue.code, issue.line]),
        [
            ["repaired-heading-space", 2],
            ["repaired-heading-space", 3],
            ["heading-skip", 3], // h2 -> h6 jump is still reported as a warning
        ],
    );
    assert.equal(r.issues[0]!.severity, "info");
});

test("fix-llm: headings already spaced are untouched", () => {
    const r = fix("# Fine\n\n## Also fine");
    assert.deepEqual(r.issues, []);
});

test("fix-llm: '#Tag' inside a code fence is NOT repaired", () => {
    const r = fix("```\n#!/usr/bin/env node\n```\n");
    assert.deepEqual(r.issues, []);
    assert.match(r.html, /#!\/usr\/bin\/env node/);
});

test("fix-llm: lines after an unclosed fence are treated as fence body", () => {
    const r = fix("```\n#NotAHeading");
    assert.deepEqual(
        r.issues.map((issue) => issue.code),
        ["unclosed-fence"],
    );
});

// -- proved artifact repair --------------------------------------------------------

test("fix-llm: standalone proved artifacts are normalized", () => {
    const r = fix(" proved\nconst x = 1\n proved");
    assert.equal(r.html, "<p> proved\nconst x = 1\n proved</p>"); // no blank lines -> one paragraph
    assert.equal(
        r.issues.filter((issue) => issue.code === "repaired-proved-block").length,
        2,
    );
});

test("fix-llm: ' proved' inside prose is left alone", () => {
    const r = fix("The experiment proved the theory.");
    assert.deepEqual(r.issues, []);
    assert.equal(r.html, "<p>The experiment proved the theory.</p>");
});

test("fix-llm: proved inside a fence is untouched", () => {
    const r = fix("```\n proved\n```");
    assert.deepEqual(r.issues, []);
});

// -- fence-wrapped frontmatter repair ------------------------------------------------

test("fix-llm: frontmatter wrapped in a yaml fence is unwrapped", () => {
    const r = fix("```yaml\n---\ntitle: x\n---\n```\n\n# Body");
    assert.deepEqual(
        r.issues.map((issue) => issue.code),
        ["repaired-frontmatter-fence", "frontmatter-unsupported"],
    );
    assert.equal(r.issues[0]!.line, 1);
    assert.match(r.html, /<h1>Body<\/h1>/);
    assert.doesNotMatch(r.html, /<pre><code/); // frontmatter no longer swallowed as code
});

test("fix-llm: a plain code fence at doc start is not unwrapped", () => {
    const r = fix("```\njust code\n```\n\n# Body");
    assert.deepEqual(r.issues, []);
});

// -- repairs never block --strict ------------------------------------------------------

test("fix-llm: repairs are info-level and never fail strict mode", () => {
    const r = fix("#NoSpace");
    assert.ok(r.issues.every((issue) => issue.severity === "info"));
});

// -- CLI end-to-end -----------------------------------------------------------------------

test("CLI --fix-llm repairs artifacts end to end", () => {
    const r = spawnSync(process.execPath, [CLI, "--fix-llm"], {
        input: "#Broken\n\n proved\n",
        encoding: "utf8",
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /<h1>Broken<\/h1>/);
    assert.match(r.stderr, /info \[repaired-heading-space\]/);
    assert.match(r.stderr, /info \[repaired-proved-block\]/);
});

test("CLI without --fix-llm leaves artifacts alone", () => {
    const r = spawnSync(process.execPath, [CLI], { input: "#Broken\n", encoding: "utf8" });
    assert.equal(r.stdout, "<p>#Broken</p>");
    assert.equal(r.stderr, "");
});

test("CLI --report json counts repairs in stats", () => {
    const r = spawnSync(process.execPath, [CLI, "--report", "json", "--fix-llm"], {
        input: "#Broken\n",
        encoding: "utf8",
    });
    const report = JSON.parse(r.stdout) as { stats: { repairs: number; warnings: number } };
    assert.equal(report.stats.repairs, 1);
    assert.equal(report.stats.warnings, 0);
});
