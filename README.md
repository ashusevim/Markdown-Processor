# Markdown Processor (marcus)

A **zero-dependency** Markdown → HTML CLI and library for Node.js — the converter that verifies its own output.

![marcus: escaping untrusted HTML, failing a CI gate on warnings, and repairing LLM artifacts](https://raw.githubusercontent.com/ashusevim/Markdown-Processor/main/docs/demo.gif)

Pandoc tells you nothing. Marked trusts everything. marcus checks the input, escapes untrusted HTML by default, and reports everything it changes.

## Install

```bash
npm install -g @ashusevim/markdown-processor   # exposes `marcus`
```

Requires Node.js >= 20. No runtime dependencies.

## Usage

```bash
marcus file.md                # HTML on stdout
cat notes.md | marcus         # stdin (implicit with no file argument)
marcus a.md b.md              # multiple files, in order
marcus --strict docs/*.md     # CI gate: exit 1 if warnings are found
marcus --report json doc.md   # machine-readable report instead of HTML
llm | marcus --fix-llm        # repair known LLM artifacts, logging each one
```

## Why marcus

- **Safe by default.** Raw HTML from users, scrapers or models is escaped to visible text, so a `<script>` can't execute. `--unsafe` passes it through for trusted documents. Most converters do the opposite and leave you to "sanitize it yourself".
- **It tells you the truth.** Render-affecting problems come back as line-numbered diagnostics instead of silently wrong HTML:

  ```text
  marcus: draft.md:4: warning [unclosed-bold]: odd number of '**' — bold segment may be unclosed
  ```

- **Repairs LLM slop on the record.** `--fix-llm` fixes the well-documented artifacts and logs every repair as an `info` issue, so nothing is rewritten behind your back.
- **Tiny and auditable.** A few hundred dependency-free lines; the CLI is a thin wrapper around a pure parser you can import.

## Options

| Option | Description |
|---|---|
| `-h`, `--help` · `-V`, `--version` | help and version |
| `-` · `--` | read stdin explicitly · treat the rest as file names |
| `--strict` | exit 1 on warning-level issues (CI gate) |
| `--report json` | JSON report (html, issues, stats) instead of HTML |
| `-q`, `--quiet` | don't mirror issues to stderr |
| `--unsafe` | pass raw HTML through unescaped (trusted input) |
| `--fix-llm` | repair LLM artifacts before parsing, logging each repair |

Exit codes: `0` success · `1` unreadable file or `--strict` warnings · `2` usage error.

## Diagnostics

Two severities: **`warning`** means the output probably doesn't match your intent (and `--strict` fails on it); **`info`** is a repair or unsupported-syntax notice, which never fails a build.

| Code | Problem |
|---|---|
| `unclosed-fence` · `unclosed-inline-code` · `unclosed-bold` · `unclosed-strikethrough` | a delimiter is never closed, so everything after it renders wrong |
| `heading-skip` | heading level jumps (e.g. `h1` → `h4`), breaking the outline |
| `list-interrupted` · `mixed-list-markers` | implicit list boundary, or marker style changed mid-list |
| `table-ragged` | a table row has more cells than the header — the extras are dropped |
| `frontmatter-unsupported` · `html-escaped` | `---` frontmatter (renders as `<hr>`) · raw HTML neutralized by safe mode |
| `repaired-*` | what `--fix-llm` changed (heading space, frontmatter fence, ` proved`, table delimiter) |

Reports are deterministic — identical input produces byte-identical output (no timestamps), so they can be cached and diffed:

```json
{
  "tool": "marcus", "version": "2.3.0",
  "files": [{ "file": "doc.md", "html": "…", "words": 5, "headings": [] }],
  "issues": [{ "file": "doc.md", "line": 5, "code": "unclosed-fence", "severity": "warning", "message": "…" }],
  "stats": { "files": 1, "words": 5, "readingTimeMinutes": 1, "warnings": 1, "infos": 0, "repairs": 0 }
}
```

## Library

```js
import { parseMarkdown, parseMarkdownDetail } from "@ashusevim/markdown-processor";

parseMarkdown("# hi");                     // '<h1>hi</h1>'
const { html, issues, headings, words } = parseMarkdownDetail(source, { fixLlm: true });
```

## Syntax

CommonMark-style blocks and GFM extensions: ATX headings, thematic breaks, blockquotes (parsed recursively), ordered/unordered lists nested to any depth, task lists (`- [x]`), GFM pipe tables with `:---`/`:-:`/`---:` alignment, fenced code with language classes, and inline code (including multi-backtick spans), bold/italic/strikethrough, links, angle autolinks and images. A leading BOM and CRLF/CR line endings are normalized.

## Limitations

- No footnotes or setext headings yet.
- Frontmatter is not parsed; it renders as a thematic break and is reported as `info`.
- Safe mode is *escape-all*, not an allowlist sanitizer. Pipe `--unsafe` output through a dedicated sanitizer if you need fine-grained control.
- Task-list checkboxes are inert (`disabled`) by design.
- Lists render tight: a blank line between items doesn't force `<p>` wrappers, and a blank line inside an item only wraps the paragraphs that follow it.

## Development

```bash
npm test        # builds, then runs the node:test suite (165 tests)
npm run build   # tsc → dist/
```

`src/parse.ts` is the whole parser and diagnostics engine (no I/O, no deps) — that's the library. `src/cli.ts` is the argument/stdin/exit-code wrapper. `docs/demo.sh` regenerates the demo GIF:

```bash
asciinema rec -q --overwrite --cols 124 --rows 32 -c "bash docs/demo.sh" docs/demo.cast
.tools/agg --font-size 14 --theme monokai docs/demo.cast docs/demo.gif
```

## License

ISC
