import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function withTempDoc(contents: string, fn: (file: string) => void): void {
    const dir = mkdtempSync(path.join(tmpdir(), "marcus-diag-"));
    try {
        const file = path.join(dir, "doc.md");
        writeFileSync(file, contents);
        fn(file);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function run(args: string[], input?: string) {
    return spawnSync(process.execPath, [CLI, ...args], { input, encoding: "utf8" });
}

const MESSY = "# Title\n\n#### Skipped\n\n**dangling\n";
const CLEAN = "# Title\n\n## Sub\n\nAll good **here**.\n";
const INFO_ONLY = "---\ntitle: x\n---\n\nhello\n";

test("warnings are mirrored to stderr with file:line by default", () => {
    withTempDoc(MESSY, (file) => {
        const r = run([file]);
        assert.equal(r.status, 0); // default mode: warnings don't fail
        assert.match(r.stderr, /doc\.md:3: warning \[heading-skip\]/);
        assert.match(r.stderr, /doc\.md:5: warning \[unclosed-bold\]/);
        assert.match(r.stdout, /<h1>Title<\/h1>/);
    });
});

test("--quiet suppresses the stderr mirror", () => {
    withTempDoc(MESSY, (file) => {
        const r = run(["--quiet", file]);
        assert.equal(r.status, 0);
        assert.equal(r.stderr, "");
    });
});

test("--strict exits 1 on warnings, 0 on clean documents", () => {
    withTempDoc(MESSY, (file) => {
        assert.equal(run(["--strict", file]).status, 1);
    });
    withTempDoc(CLEAN, (file) => {
        const r = run(["--strict", file]);
        assert.equal(r.status, 0);
        assert.equal(r.stderr, "");
    });
});

test("info-level issues never fail --strict", () => {
    withTempDoc(INFO_ONLY, (file) => {
        const r = run(["--strict", file]);
        assert.equal(r.status, 0);
        assert.match(r.stderr, /info \[frontmatter-unsupported\]/);
    });
});

test("--report json emits a parseable report with html, issues and stats", () => {
    withTempDoc(MESSY, (file) => {
        const r = run(["--report", "json", file]);
        assert.equal(r.status, 0);
        const report = JSON.parse(r.stdout) as {
            tool: string;
            version: string;
            files: { file: string; html: string; words: number; headings: unknown[] }[];
            issues: { file: string; line: number; code: string; severity: string }[];
            stats: { files: number; words: number; warnings: number; infos: number };
        };
        assert.equal(report.tool, "marcus");
        assert.match(report.version, /^\d+\.\d+\.\d+$/);
        assert.equal(report.files.length, 1);
        assert.match(report.files[0]!.html, /<h1>Title<\/h1>/);
        assert.equal(report.files[0]!.file, file);
        assert.equal(report.issues.length, 2);
        assert.equal(report.issues[0]!.file, file);
        assert.equal(report.issues[0]!.line, 3);
        assert.equal(report.stats.files, 1);
        assert.equal(report.stats.warnings, 2);
    });
});

test("--report json aggregates multiple files and still shows strict status", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "marcus-diag-"));
    try {
        const a = path.join(dir, "a.md");
        const b = path.join(dir, "b.md");
        writeFileSync(a, CLEAN);
        writeFileSync(b, MESSY);
        const r = run(["--report", "json", a, b]);
        const report = JSON.parse(r.stdout) as { stats: { files: number; warnings: number } };
        assert.equal(report.stats.files, 2);
        assert.equal(report.stats.warnings, 2);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("--report json still fails under --strict with warnings", () => {
    withTempDoc(MESSY, (file) => {
        const r = run(["--report", "json", "--strict", file]);
        assert.equal(r.status, 1);
        assert.ok(JSON.parse(r.stdout));
    });
});

test("unknown --report format is a usage error (exit 2)", () => {
    const r = run(["--report", "xml"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown report format: xml/);
});

test("--report without a value is a usage error (exit 2)", () => {
    const r = run(["--report"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--report requires a format/);
});

test("report output is deterministic for identical input", () => {
    withTempDoc(MESSY, (file) => {
        const a = run(["--report", "json", file]).stdout;
        const b = run(["--report", "json", file]).stdout;
        assert.equal(a, b);
    });
});
