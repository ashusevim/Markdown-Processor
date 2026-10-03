#!/usr/bin/env node
/**
 * marcus — markdown → HTML CLI with diagnostics.
 *
 * Thin wrapper around src/parse.ts: argument parsing, stdin support and exit
 * codes live here; all conversion logic lives in the pure parser module.
 * Zero runtime dependencies by design (see RESEARCH.md §6).
 */
import { readFile } from "node:fs/promises";
import { parseMarkdownDetail } from "./parse.js";
import { VERSION } from "./version.js";
const HELP = `marcus ${VERSION} — markdown → HTML converter with diagnostics

Usage: marcus [options] [file ...]

Converts each Markdown file to HTML on stdout. With no file given (or with
an explicit "-"), Markdown is read from stdin — handy in pipes:

    cat notes.md | marcus
    marcus README.md > README.html

Unlike other converters, marcus reports render-affecting problems on stderr
with line numbers instead of producing silently wrong HTML.

By default, raw HTML in the input is escaped to visible text — safe for
untrusted content such as LLM or user output. Pass --unsafe for trusted
documents that embed real HTML.

Options:
  -h, --help       show this help and exit
  -V, --version    print version and exit
  -                read from stdin (implicit when no file is given)
  --strict         exit 1 if any warning-level issue is found (CI gate)
  --report json    print a JSON report (html, issues, stats) instead of HTML
  -q, --quiet      don't mirror issues to stderr
  --unsafe         allow raw HTML through unescaped (for trusted input)

Exit codes:
  0  success (or only info-level issues)
  1  a file could not be read, or --strict found warnings
  2  usage error

Issue severities:
  warning  output probably doesn't match author intent (--strict fails on these)
  info     deliberate repairs or unsupported-syntax notices (never fails --strict)

Issue codes:
  unclosed-fence          code fence never closed; rest of file renders as code
  unclosed-inline-code    unpaired backtick on a line
  unclosed-bold           odd number of '**' in a text run
  unclosed-strikethrough  odd number of '~~' in a text run
  heading-skip            heading level jumps (h2 -> h4), breaking the outline
  list-interrupted        non-list line implicitly closed an open list
  mixed-list-markers      list marker style switched mid-list
  frontmatter-unsupported '---' frontmatter detected; not supported yet
  html-escaped            raw HTML was escaped in safe mode (--unsafe keeps it)
`;
/** Thrown by parseArgs for unrecognized options; maps to exit code 2. */
class UsageError extends Error {
}
function parseArgs(argv) {
    const files = [];
    let help = false;
    let version = false;
    let strict = false;
    let quiet = false;
    let report = null;
    let unsafeHtml = false;
    let onlyFiles = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!onlyFiles && arg === "--") {
            onlyFiles = true;
            continue;
        }
        if (!onlyFiles && arg.startsWith("-") && arg !== "-") {
            if (arg === "-h" || arg === "--help")
                help = true;
            else if (arg === "-V" || arg === "--version")
                version = true;
            else if (arg === "--strict")
                strict = true;
            else if (arg === "-q" || arg === "--quiet")
                quiet = true;
            else if (arg === "--unsafe")
                unsafeHtml = true;
            else if (arg === "--report") {
                const value = argv[i + 1];
                if (value === undefined)
                    throw new UsageError("--report requires a format (supported: json)");
                if (value !== "json")
                    throw new UsageError(`unknown report format: ${value} (supported: json)`);
                report = "json";
                i++; // consume the format value
            }
            else
                throw new UsageError(`unknown option: ${arg}`);
            continue;
        }
        files.push(arg);
    }
    return { files, help, version, strict, quiet, report, unsafeHtml };
}
/** Read all of stdin. Empty string if stdin is closed or empty. */
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}
async function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    }
    catch (error) {
        process.stderr.write(`marcus: ${error.message}\n\n${HELP}`);
        process.exitCode = 2;
        return;
    }
    if (opts.help) {
        process.stdout.write(HELP);
        return;
    }
    if (opts.version) {
        process.stdout.write(`${VERSION}\n`);
        return;
    }
    const files = opts.files.length > 0
        ? opts.files
        : process.stdin.isTTY
            ? null
            : ["-"];
    if (files === null) {
        process.stderr.write(`marcus: no input file and stdin is a terminal\n\n${HELP}`);
        process.exitCode = 2;
        return;
    }
    let hadError = false;
    let wroteAny = false;
    const fileReports = [];
    const allIssues = [];
    let totalWords = 0;
    for (const file of files) {
        try {
            const markdown = file === "-" ? await readStdin() : await readFile(file, "utf8");
            const result = parseMarkdownDetail(markdown, { unsafeHtml: opts.unsafeHtml });
            for (const issue of result.issues) {
                allIssues.push({ ...issue, file });
                if (!opts.quiet) {
                    process.stderr.write(`marcus: ${file}:${issue.line}: ${issue.severity} [${issue.code}]: ${issue.message}\n`);
                }
            }
            totalWords += result.words;
            fileReports.push({ file, html: result.html, words: result.words, headings: result.headings });
            if (opts.report === "json")
                continue;
            if (wroteAny)
                process.stdout.write("\n");
            process.stdout.write(result.html);
            wroteAny = true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            process.stderr.write(`marcus: ${file}: ${message}\n`);
            hadError = true;
        }
    }
    if (opts.report === "json") {
        const warnings = allIssues.filter((issue) => issue.severity === "warning").length;
        const infos = allIssues.length - warnings;
        const report = {
            tool: "marcus",
            version: VERSION,
            files: fileReports,
            issues: allIssues,
            stats: {
                files: fileReports.length,
                words: totalWords,
                readingTimeMinutes: Math.max(1, Math.round(totalWords / 200)),
                warnings,
                infos,
            },
        };
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
    const warnings = allIssues.filter((issue) => issue.severity === "warning").length;
    process.exitCode = hadError || (opts.strict && warnings > 0) ? 1 : 0;
}
await main();
