# marcus — Shipping Research & Product Decision

*Research date: Oct 2026. Goal: find what unique, important feature real users want that competing tools don't have.*

## 1. Competitive landscape

| Tool | Type | Scale (npm dl/week) | CLI quality | Raw HTML default | Render diagnostics |
|---|---|---|---|---|---|
| pandoc | universal converter (Haskell binary) | n/a | powerful but complex, huge flags surface | **passes raw HTML through** (disable = `-f markdown-raw_html` gymnastics) | none |
| marked | JS library | ~95.9M | thin bin | **passes through** — docs warn "🚨 Marked does not sanitize the output HTML" | none |
| markdown-it | JS library | ~34.0M | none official (3rd-party only) | `html:false` escapes HTML (library-level default only) | none |
| cmark | C reference impl | n/a | yes | passes through; `--safe` is **opt-in** | `--validate` checks reference links only |
| markdownlint / mdl / rumdl / pymarkdown | style linters | large | yes | n/a | **style rules only** (MD013 line length, MD029 prefixes…) — never "will this render wrong"; separate tool from any converter |
| markdown-to-html-cli | dedicated md→html CLI | ~6.7k | yes | passes through | none |
| md-to-pdf | CLI (Puppeteer) | ~274k | yes | passes through | none |

**Key insight:** the dedicated md→html CLI niche is tiny and weak (6.7k/week vs 95.9M for the marked library). The giants are libraries with thin or no CLIs. Nobody combines conversion + verification.

## 2. Evidence: what real users struggle with

1. **XSS / trusted-input model.** marked, Showdown, and python-markdown all explicitly push sanitization onto the user ("we do NOT sanitize; use DOMPurify on the output"). No mainstream converter CLI sanitizes by default.
2. **Silent mis-rendering.** Markdown parsers are lenient by design; broken input produces quietly-wrong HTML. mdmathlint was built exactly because "Markdown math rendering fails silently… you only discover after deployment" — proving demand for *render-correctness* checks, but nothing exists for general markdown.
3. **LLM-generated markdown is broken in known, repeated ways.** Documented across the ecosystem: unclosed code fences, ` ``` ` wrapped frontmatter, merged table rows, `<think>` artifacts (deeptutor#1235, opencode#20952 "auto-closing unclosed fences at the render layer", OpenWebUI's "Markdown Normalizer" plugin, markstream-vue). There is even an arXiv paper with a failure taxonomy: *Benchmarking Markdown Boundary Failures in LLM-Generated Text* (arXiv:2609.06993) — premature closure, unclosed fence, delimiter collision. Every project hand-rolls its own repair hacks; **no CLI productizes this**.
4. **Watch/live-preview is saturated** (mdserve, markserv, VS Code extensions, md-review…) — *not* a differentiator.

## 3. Decision — the unique wedge

> **marcus = the trust-boundary markdown CLI: it converts AND tells you the truth about your input.**

Pandoc tells you nothing. marked trusts everything. markdownlint checks style, not rendering. **marcus is the converter that verifies its own output.** That positioning is unclaimed.

### Killer feature: diagnostic-aware conversion with a machine-readable report

```bash
marcus doc.md                  # HTML → stdout, warnings → stderr with file:line
marcus --strict doc.md         # exit 1 if any render-affecting issue found → CI gate
marcus --report json doc.md    # structured report: issues[], repairs[], stats (TOC, words, reading time)
```

Diagnostics no other converter emits, with line numbers: unclosed `**` / backticks, skipped heading levels, unclosed fences, ambiguous list markers, suspicious constructs that will mis-render.

### Killer feature #2: LLM-artifact repair pack (`--fix-llm`, opt-in, every repair logged)

Auto-close unclosed fences · unwrap ` ``` ` wrapped frontmatter · repair merged/split table rows · neutralize `<think>` blocks · fix `DOUBLE_CAPS` shouting artifacts. Each repair is reported, never silent. This turns marcus into the default "render AI output" tool — a use case growing explosively, with zero CLI products.

### Supporting pillars (required for credibility, not unique)

- **Safe by default** — raw HTML escaped unless `--unsafe` (the inverse of pandoc/marked/cmark).
- **Clean output by default** — semantic HTML; drop hardcoded Tailwind classes (`bg-gray-200 text-red-600`, `rounded-lg shadow-md`) to opt-in.
- **GFM table stakes** — links (currently missing entirely!), tables, task lists, fenced code, nested lists, multi-line blockquotes, frontmatter.
- **Pipeline hygiene** — stdin support, correct exit codes (today file errors exit 0), `--fragment` vs full-document mode, byte-deterministic output.

## 4. Shipping order

1. **Correctness first** ✅ *done 2026-10-03*: zero-dep restructure (`src/parse.ts` pure library + thin `src/cli.ts`, commander removed, ESM, engines >=20), links + link titles, italics, bold-italic, code fences with escaping, multi-line blockquotes (recursive), correct paragraph wrapping, list-close bug fixed, stdin support, real exit codes (0/1/2), 44-test `node:test` suite. Remaining GFM (tables, nested lists, task lists) moves to phase 2/3 work.
2. **Diagnostics engine** ✅ *done 2026-10-03*: `parseMarkdownDetail()` returns `{ html, issues, headings, words }`; 8 issue codes with line numbers (unclosed fences/inline-code/bold/strikethrough, heading-skip, list-interrupted, mixed-list-markers, frontmatter-unsupported); severities `warning`/`info`; `--strict` CI gate (exit 1 on warnings, infos never block), `--report json` deterministic machine-readable report (html + issues + TOC + stats/reading time), `--quiet`; blockquote recursion carries absolute line offsets; v1.2.0, 73 tests.
3. **Safe-by-default** ✅ *done 2026-10-03*: raw HTML escaped to visible text by default (block-level lines *and* inline tags in headings/paragraphs/list-items/quotes) — the inverse of marked/pandoc/cmark defaults, answering their "sanitize it yourself" warnings; already-escaped entities preserved, bare `&` completed for valid output; angle autolinks protected as markdown syntax; new `html-escaped` info issue points at every neutralized block line; `--unsafe` restores verbatim passthrough for trusted docs; autolink hrefs now attribute-escaped in both modes; semver major → v2.0.0, 88 tests.
4. **`--fix-llm` repair pack** ✅ *done 2026-10-03*: opt-in pre-pass repairing the documented LLM anomalies (deeptutor#1235, llm_wiki#581, OpenWebUI normalizer) — `##Title` heading-space fix, fence-wrapped frontmatter unwrap, stray ` proved` artifact normalization (whole-line matches only, fences untouched, line numbers stable); every repair logged as info issue (`repaired-*` codes) and counted in `--report json` stats.repairs; `--fix-llm` CLI flag; v2.1.0, 101 tests.
5. **GFM tables + task lists** ✅ *done 2026-10-03*: pipe tables (optional outer pipes, `:---`/`:-:`/`---:` alignment, escaped `\|`, inline processing per cell, recursive inside blockquotes) and task lists (`- [ ]`/`- [x]` → inert disabled checkboxes, `contains-task-list`/`task-list-item` classes); new `table-ragged` warning when a row has more cells than the header (silent data loss); `--fix-llm` also repairs delimiter rows whose column count disagrees with the header (the common LLM table slip); proper CommonMark backtick-run code spans (`` ``a `b` c`` ``, `` ` ```yaml ` ``) — which also killed the last three false-positive warnings on marcus's own README; v2.2.0, 149 tests. marcus's README now converts with **zero** diagnostics.
2. **Diagnostics engine** + `--strict` + `--report` (the differentiator — build this before anything else unique).
3. **Safe-by-default** + fragment/document modes + clean output.
4. **`--fix-llm` repair pack** (ride the AI-output wave; write blog post + benchmarks against the arXiv taxonomy).
5. Later: `--meta` (frontmatter/TOC/stats) for static-site pipelines.

## 6. Stack decision (measured, Oct 2026)

**Verdict: keep TypeScript + Node. Change the packaging, not the stack.**

Measurements on the current codebase (Node v26.8.1):
- Cold start: ~57ms/invocation (Node runtime floor ~44ms; CLI overhead ~13ms)
- Throughput: 8.5MB markdown → 5.5MB HTML in 373ms total, on the naive regex parser (~23MB/s)

Performance is a non-argument for a rewrite: this tool category's users (docs CI, LLM-output rendering, shell pipes) never feel 50ms. cmark already owns the "fastest" niche in C; our wedge is trust/diagnostics/repair, not raw speed.

Why TS/Node is the *right* stack for this specific wedge:
1. The killer use case (rendering LLM output) lives in the JS/TS ecosystem — chat apps, VS Code extensions, web UIs, plugin systems. One TS core ships as CLI **and** npm library **and** browser bundle. Go/Rust cores can't be `npm install`ed by embedding apps (would need wasm bindings = double the work).
2. Diagnostics + repair rules will attract many small contributions; TS maximizes contributor pool.
3. A **zero-dependency** tool ("audit the entire thing in one file") is itself a marketing asset for a trust/security-positioned product.

Tactical changes (do these):
- Drop `commander` → zero runtime deps (hand-rolled arg parsing, ~50 lines)
- Split lib/CLI: export `parseMarkdown()` as a library; keep `bin/marcus` thin
- `"type": "module"`, `engines: { node: ">=20" }` — ESM-only in phase 1; add CJS via tsup later only if consumers demand it
- Tests with `node:test` (built-in, keeps zero-dep purity)

Optional artifacts from the same core, only when demand appears:
- `bun build --compile` single binary for non-Node users
- Browser bundle → "paste your broken LLM markdown" playground page

Revisit the stack ONLY if: (a) profiling shows Node startup dominates real CI usage at scale, or (b) a hard requirement for native single-binary distribution to non-developers emerges. Neither is true today.

## 7. End-to-end verification (2026-10-03)

Ran the tool the way a real user would: `npm install` into an isolated prefix (symlinked package + `marcus` bin shim), then drove the installed binary, the CLI surface and the published entry points.

| Scenario | Result |
|---|---|
| Install + bin shim, run from any cwd | ✅ `marcus 2.1.1`, shim → `dist/cli.js` |
| Own README (22 fences, tables, quotes) | ✅ balanced HTML (2 h1, 20 h2, 22 pre, 200 code spans) |
| Unicode/emoji/CJK, CRLF, lone CR, empty, whitespace-only, no trailing newline | ✅ all correct |
| Error paths: directory, unreadable file, missing file | ✅ exit 1 + clean message |
| 354 kB single line · 4.4 MB / 60k sections | ✅ balanced · 1.33 s |
| CI gate (`--strict`) clean vs dirty doc | ✅ exit 0 / exit 1 |
| stdin vs file input · run-to-run determinism | ✅ byte-identical |
| Library consumer (`npm install ../..`, ESM import) | ✅ `parseMarkdown` / `parseMarkdownDetail` / `fixLlm` |
| `npm pack --dry-run` | ✅ 10 files, 11.3 kB tarball, `dist/` + README only |

**Bugs found and fixed by this pass (v2.1.1):**

1. A leading BOM (U+FEFF) broke the first heading and leaked an invisible character into the HTML — now stripped in `normalizeNewlines`.
2. Issues were returned in insertion order, so a deferred paragraph check (reported at the paragraph's first line) could appear after an issue on a later line — now sorted into document order (stable, same-line order preserved).

**Deferred findings (real gaps, not bugs):** nested lists and footnotes are still unsupported (nested input renders flattened); setext headings (`Title\n=====`) are not implemented. Both are recorded rather than silently mis-rendered. *(Resolved since the E2E pass: pipe tables now render, and CommonMark backtick-run code spans removed the last false-positive warnings — marcus's own README converts with zero diagnostics.)*

## 8. Sources

- marked docs warning (no sanitize): https://github.com/markedjs/marked/blob/main/docs/INDEX.md
- Showdown trusted-input model: https://github.com/showdownjs/showdown/blob/master/docs/xss.md
- python-markdown sanitization: https://python-markdown.github.io/sanitization/
- pandoc raw_html extension: https://pandoc.org/MANUAL.html
- cmark (`--safe`, `--validate`): https://github.com/commonmark/cmark
- markdownlint (style-only rules): https://github.com/markdownlint/markdownlint
- mdmathlint (silent-failure precedent): https://github.com/malyjacob/mdmathlint
- LLM markdown anomalies: https://github.com/hkuds/deeptutor/issues/1235 · https://github.com/anomalyco/opencode/issues/20952 · https://github.com/simon-he95/markstream-vue (docs/use-cases/incomplete-markdown-renderer.md)
- arXiv:2609.06993 — Benchmarking Markdown Boundary Failures in LLM-Generated Text
- npm download numbers via npm registry API (week of 2026-09-25 → 2026-10-01)
