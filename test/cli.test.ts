import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(args: string[], input?: string) {
    return spawnSync(process.execPath, [CLI, ...args], {
        input,
        encoding: "utf8",
    });
}

test("--version prints the version", () => {
    const r = run(["--version"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^\d+\.\d+\.\d+\n$/);
});

test("--help prints usage", () => {
    const r = run(["--help"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage: marcus/);
    assert.match(r.stdout, /Exit codes:/);
});

test("reads markdown from piped stdin without a file argument", () => {
    const r = run([], "## hello");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "<h2>hello</h2>\n");
});

test("explicit - argument reads stdin", () => {
    const r = run(["-"], "# title");
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "<h1>title</h1>\n");
});

test("converts a file argument", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "marcus-test-"));
    try {
        const file = path.join(dir, "doc.md");
        writeFileSync(file, "# hi\n\n**bold**");
        const r = run([file]);
        assert.equal(r.status, 0);
        assert.equal(r.stdout, "<h1>hi</h1>\n<p><strong>bold</strong></p>\n");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("converts multiple files in order", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "marcus-test-"));
    try {
        const a = path.join(dir, "a.md");
        const b = path.join(dir, "b.md");
        writeFileSync(a, "# A");
        writeFileSync(b, "# B");
        const r = run([a, b]);
        assert.equal(r.status, 0);
        assert.equal(r.stdout, "<h1>A</h1>\n<h1>B</h1>\n");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("missing file exits 1 with a message on stderr", () => {
    const r = run(["definitely-not-here.md"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /marcus: definitely-not-here\.md:/);
    assert.equal(r.stdout, "");
});

test("one bad file does not stop other files; final exit code is 1", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "marcus-test-"));
    try {
        const good = path.join(dir, "good.md");
        writeFileSync(good, "# ok");
        const r = run(["nope.md", good]);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /nope\.md/);
        assert.match(r.stdout, /<h1>ok<\/h1>/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("unknown option exits 2 with usage on stderr", () => {
    const r = run(["--nope"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown option: --nope/);
    assert.match(r.stderr, /Usage: marcus/);
});

test("-- terminator treats following args as files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "marcus-test-"));
    try {
        const file = path.join(dir, "--weird.md");
        writeFileSync(file, "# dashname");
        const r = run(["--", file]);
        assert.equal(r.status, 0);
        assert.match(r.stdout, /<h1>dashname<\/h1>/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
