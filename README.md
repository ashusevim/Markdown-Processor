# Markdown Processor (marcus)

A **zero-dependency** Markdown → HTML CLI and library for Node.js.

Converts Markdown to clean, semantic HTML fragments on stdout — built for pipes, CI and embedding. Reads from stdin, tells the truth with its exit codes, and ships as a tiny importable parser (`parseMarkdown`) you can use in your own tools.

## Why marcus

- **Zero runtime dependencies** — the whole tool is a few hundred lines you can audit in one sitting.
- **Pipeline-first** — stdin in, HTML out, exit codes that mean something.
- **Safe by default** — raw HTML from untrusted sources (users, LLMs) is escaped to visible text; `--unsafe` for trusted documents. Most converters do the opposite and warn you to "sanitize yourself".
- **Tells you the truth** — render-affecting problems come back as line-numbered warnings (`--strict`, `--report json`), not silently wrong HTML.
- **Library and CLI in one** — the CLI is a thin wrapper around a pure parser module.

> Roadmap: marcus is becoming the *trust-boundary* markdown CLI — see [RESEARCH.md](RESEARCH.md). ✅ Phase 1 correctness rework · ✅ Phase 2 diagnostics engine · ✅ Phase 3 safe by default · ✅ Phase 4 LLM-output repair pack.

## Install

```bash
npm install -g .          # exposes `marcus`
# or use without installing:
node dist/cli.js file.md
```

Requires Node.js >= 20.

## Usage

```bash
marcus file.md                 # HTML on stdout
marcus a.md b.md               # multiple files, in order
cat notes.md | marcus          # stdin (implicit when no file given)
marcus - < notes.md            # stdin, explicit
marcus --help
```

Programmatic use:

```js
import { parseMarkdown } from "markdown-processor";

parseMarkdown("# hi\n\n**bold** and [a link](https://ex.com)");
// → '<h1>hi</h1>\n<p><strong>bold</strong> and <a href="https://ex.com">a link</a></p>'
```

## Options

| Option | Description |
|---|---|
| `-h`, `--help` | show help and exit |
| `-V`, `--version` | print version and exit |
| `-` | read from stdin (implicit when no file is given) |
| `--` | treat all following arguments as file names |
| `--strict` | exit 1 if any warning-level issue is found (CI gate) |
| `--report json` | print a JSON report (html, issues, stats) instead of HTML |
| `-q`, `--quiet` | don't mirror issues to stderr |
| `--unsafe` | allow raw HTML through unescaped (for trusted input) |
| `--fix-llm` | repair common LLM-output artifacts before parsing; every repair logged |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success (or only info-level issues) |
| `1` | a file could not be read, or `--strict` found warnings |
| `2` | usage error (unknown option, no input and stdin is a terminal) |

## Supported syntax

- Headings: `#` … `######` (with optional closing hashes: `## Title ##`)
- Thematic breaks: `---`, `***`, `___` (spaced variants too)
- Blockquotes: consecutive `>` lines group into one blockquote; contents are parsed (headings/lists inside quotes work)
- Unordered lists: `*` / `-` / `+` item
- Ordered lists: `1.` or `1)` item
- Code fences: ` ```lang ` … ` ``` ` (also `~~~`); content is HTML-escaped, language becomes `class="language-…"`
- Links: `[text](url "title")` and angle autolinks `<https://…>`
- Images: `![alt](src "title")`
- Bold: `**text**` / `__text__` · Italic: `*text*` / `_text_` · Bold+italic: `***text***`
- Strikethrough: `~~text~~`
- Inline code: `` `code` `` (HTML inside is escaped)
- Paragraphs: consecutive text lines are wrapped in `<p>`; blank lines separate them
- Raw HTML: escaped to visible text by default (safe — script tags become inert text); `--unsafe` passes it through verbatim
- Input robustness: a leading BOM is dropped, CRLF/CR line endings are normalized, unicode/emoji pass through untouched

## Diagnostics (the marcus difference)

Converters usually fail silently: broken input goes in, quietly-wrong HTML comes out. marcus reports render-affecting problems with line numbers instead.

```text
$ marcus doc.md
marcus: doc.md:5: warning [unclosed-fence]: code fence opened here is never closed — everything after it renders as code
```

| Severity | Meaning |
|---|---|
| `warning` | output probably doesn't match author intent — `--strict` fails on these |
| `info` | deliberate repairs or unsupported-syntax notices — never fails `--strict` |

| Code | Problem |
|---|---|
| `unclosed-fence` | code fence never closed; the rest of the file renders as code |
| `unclosed-inline-code` | unpaired backtick on a line |
| `unclosed-bold` | odd number of `**` in a text run |
| `unclosed-strikethrough` | odd number of `~~` in a text run |
| `heading-skip` | heading level jumps (e.g. `h1` → `h4`), breaking the document outline |
| `list-interrupted` | a non-list line implicitly closed an open list |
| `mixed-list-markers` | list marker style switched mid-list |
| `frontmatter-unsupported` | `---` frontmatter detected; not supported yet (renders as `<hr>`) |
| `html-escaped` | raw HTML was neutralized in safe mode (`--unsafe` keeps it) |
| `repaired-*` | LLM artifact fixed by `--fix-llm` (info-level, never blocks) |

### CI gate

```bash
marcus --strict docs/*.md || echo "docs have render problems"
```

### Machine-readable report

```bash
marcus --report json doc.md
```

```json
{
  "tool": "marcus",
  "version": "2.0.0",
  "files": [{ "file": "doc.md", "html": "…", "words": 5, "headings": [] }],
  "issues": [{ "file": "doc.md", "line": 5, "code": "unclosed-fence", "severity": "warning", "message": "…" }],
  "stats": { "files": 1, "words": 5, "readingTimeMinutes": 1, "warnings": 1, "infos": 0, "repairs": 0 }
}
```

Reports are deterministic — same input produces byte-identical output (no timestamps), safe to cache and diff.

### LLM output repair (`--fix-llm`)

LLM-generated markdown breaks in known, repeated ways (unclosed fences, mangled headings, stray tokens). `--fix-llm` repairs the well-understood ones before parsing — and **logs every repair** as an info issue, so a repaired document is never silently rewritten:

| Repair | Before → After |
|---|---|
| `repaired-heading-space` | `##Title` → `## Title` |
| `repaired-frontmatter-fence` | frontmatter wrapped in a ` ```yaml ` fence → unwrapped |
| `repaired-proved-block` | stray ` proved` line (the classic artifact) → ` proved` |

Repairs are conservative by design: code fences are never touched, prose is never rewritten (only whole-line artifact matches), and line numbers stay stable. Combined with safe-by-default, the pipeline for untrusted model output is:

```bash
llm | marcus --fix-llm > clean.html     # safe + repaired, every change logged
```

Library API:

```js
import { parseMarkdownDetail } from "markdown-processor";

const { html, issues, headings, words } = parseMarkdownDetail(source);
```

## Development

```bash
npm test        # builds, then runs the node:test suite (109 tests)
npm run build   # tsc → dist/
npm start -- file.md
```

Layout:

```
src/parse.ts     pure parser + diagnostics (no I/O, no deps) — this is the library
src/cli.ts       thin CLI wrapper: args, stdin, exit codes, report
src/version.ts   version constant (keep in sync with package.json)
test/*.test.ts   node:test suite (runs TS directly via Node type stripping)
```

## Limitations (known, deliberate)

- No nested lists, tables, task lists or footnotes yet — planned alongside the phase 4 work.
- Frontmatter (`---` at the top) currently renders as a thematic break (reported as info).
- Safe mode is *escape-all*, not an allowlist sanitizer: no HTML survives by default (even harmless `<b>`). For fine-grained sanitization with `--unsafe`, pipe the output through a dedicated sanitizer.
- A blank line inside a list keeps the list open but does not create loose (`<p>`-in-`<li>`) items.

## License

ISC
