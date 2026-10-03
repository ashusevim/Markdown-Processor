#!/usr/bin/env node
/**
 * marcus — markdown → HTML CLI.
 *
 * Thin wrapper around src/parse.ts: argument parsing, stdin support and exit
 * codes live here; all conversion logic lives in the pure parser module.
 * Zero runtime dependencies by design (see RESEARCH.md §6).
 */
import { readFile } from "node:fs/promises";
import { parseMarkdown } from "./parse.js";
import { VERSION } from "./version.js";
const HELP = `marcus ${VERSION} — markdown → HTML converter

Usage: marcus [options] [file ...]

Converts each Markdown file to HTML on stdout. With no file given (or with
an explicit "-"), Markdown is read from stdin — handy in pipes:

    cat notes.md | marcus
    marcus README.md > README.html

Options:
  -h, --help      show this help and exit
  -V, --version   print version and exit
  -               read from stdin (implicit when no file is given)

Exit codes:
  0  success
  1  a file could not be read (reported on stderr; remaining files still convert)
  2  usage error
`;
/** Thrown by parseArgs for unrecognized options; maps to exit code 2. */
class UsageError extends Error {
}
function parseArgs(argv) {
    const files = [];
    let help = false;
    let version = false;
    let onlyFiles = false;
    for (const arg of argv) {
        if (!onlyFiles && arg === "--") {
            onlyFiles = true;
            continue;
        }
        if (!onlyFiles && arg.startsWith("-") && arg !== "-") {
            if (arg === "-h" || arg === "--help")
                help = true;
            else if (arg === "-V" || arg === "--version")
                version = true;
            else
                throw new UsageError(`unknown option: ${arg}`);
            continue;
        }
        files.push(arg);
    }
    return { files, help, version };
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
    for (const file of files) {
        try {
            const markdown = file === "-" ? await readStdin() : await readFile(file, "utf8");
            if (wroteAny)
                process.stdout.write("\n");
            process.stdout.write(parseMarkdown(markdown));
            wroteAny = true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            process.stderr.write(`marcus: ${file}: ${message}\n`);
            hadError = true;
        }
    }
    process.exitCode = hadError ? 1 : 0;
}
await main();
