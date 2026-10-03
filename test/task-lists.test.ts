import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseMarkdown, parseMarkdownDetail } from "../src/parse.ts";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const BOX = (checked: boolean) => `<input type="checkbox" class="task-list-item-checkbox"${checked ? " checked" : ""} disabled>`;

// -- checkbox rendering ------------------------------------------------------------

test("unchecked and checked task items render inert checkboxes", () => {
    assert.equal(
        parseMarkdown("- [ ] todo\n- [x] done"),
        `<ul class="contains-task-list">\n` +
            `<li class="task-list-item">${BOX(false)} todo</li>\n` +
            `<li class="task-list-item">${BOX(true)} done</li>\n` +
            `</ul>`,
    );
});

test("uppercase [X] counts as checked", () => {
    assert.match(parseMarkdown("- [X] done"), /checked disabled>/);
});

test("an empty task item renders a checkbox with no trailing text", () => {
    assert.equal(
        parseMarkdown("- [ ]"),
        `<ul class="contains-task-list">\n<li class="task-list-item">${BOX(false)}</li>\n</ul>`,
    );
});

test("the list class is added retroactively when a later item is a task", () => {
    assert.equal(
        parseMarkdown("- plain\n- [x] task"),
        `<ul class="contains-task-list">\n<li>plain</li>\n<li class="task-list-item">${BOX(true)} task</li>\n</ul>`,
    );
});

test("ordered task lists work too", () => {
    assert.match(parseMarkdown("1. [ ] one\n2. [x] two"), /^<ol class="contains-task-list">/);
});

test("task list inside a blockquote is parsed recursively", () => {
    assert.equal(
        parseMarkdown("> - [ ] q"),
        `<blockquote>\n<ul class="contains-task-list">\n<li class="task-list-item">${BOX(false)} q</li>\n</ul>\n</blockquote>`,
    );
});

// -- must NOT be treated as a checkbox ------------------------------------------------

test("a link whose text is 'x' in brackets is not a task item", () => {
    assert.equal(
        parseMarkdown("- [x](https://e.com)"),
        '<ul>\n<li><a href="https://e.com">x</a></li>\n</ul>',
    );
});

test("brackets without a valid marker stay literal", () => {
    assert.equal(parseMarkdown("- [y] nope"), "<ul>\n<li>[y] nope</li>\n</ul>");
});

// -- diagnostics / counting -----------------------------------------------------------

test("the checkbox marker does not count as a word", () => {
    assert.equal(parseMarkdownDetail("- [x] one two\n- [ ] three").words, 3);
});

test("inline checks run on the label, not the marker", () => {
    const r = parseMarkdownDetail("- [x] **dangling");
    assert.equal(r.issues[0]!.code, "unclosed-bold");
    assert.equal(r.issues[0]!.line, 1);
});

// -- CLI end-to-end (tables + task lists together) -------------------------------------

test("CLI converts a document with a table and a task list", () => {
    const doc = "# Plan\n\n| step | owner |\n| :--- | ---: |\n| build | me |\n\n- [x] design\n- [ ] ship\n";
    const r = spawnSync(process.execPath, [CLI], { input: doc, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /<table>\n<thead>/);
    assert.match(r.stdout, /<th style="text-align: left">step<\/th>/);
    assert.match(r.stdout, /<td style="text-align: right">me<\/td>/);
    assert.match(r.stdout, /<ul class="contains-task-list">/);
    assert.match(r.stdout, /checked disabled> design/);
});
