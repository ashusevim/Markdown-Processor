# Markdown Processor (marcus)

A **zero-dependency** Markdown → HTML CLI and library for Node.js.

Converts Markdown to clean, semantic HTML fragments on stdout — built for pipes, CI and embedding. Reads from stdin, tells the truth with its exit codes, and ships as a tiny importable parser (`parseMarkdown`) you can use in your own tools.

## Why marcus

- **Zero runtime dependencies** — the whole tool is a few hundred lines you can audit in one sitting.
- **Pipeline-first** — stdin in, HTML out, exit codes that mean something.
- **Library and CLI in one** — the CLI is a thin wrapper around a pure parser module.

> Roadmap: marcus is becoming the *trust-boundary* markdown CLI — see [RESEARCH.md](RESEARCH.md) for the full product research: phase 2 adds conversion diagnostics (`--strict`, `--report json`), phase 3 safe-by-default HTML escaping, phase 4 an LLM-output repair pack.

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

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success |
| `1` | a file could not be read (reported on stderr; remaining files still convert) |
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
- Raw HTML passthrough: lines starting with a tag are emitted verbatim

## Development

```bash
npm test        # builds, then runs the node:test suite (44 tests)
npm run build   # tsc → dist/
npm start -- file.md
```

Layout:

```
src/parse.ts     pure parser (no I/O, no deps) — this is the library
src/cli.ts       thin CLI wrapper: args, stdin, exit codes
src/version.ts   version constant (keep in sync with package.json)
test/*.test.ts   node:test suite (runs TS directly via Node type stripping)
```

## Limitations (known, deliberate)

- No nested lists, tables, task lists or footnotes yet — planned alongside the phase 2/3 work.
- Frontmatter (`---` at the top) currently renders as a thematic break.
- Raw HTML is passed through unescaped by design for now — safe-by-default escaping lands in phase 3.
- A blank line inside a list keeps the list open but does not create loose (`<p>`-in-`<li>`) items.

## License

ISC
