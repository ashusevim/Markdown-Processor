/**
 * marcus core parser — Markdown → HTML with diagnostics.
 *
 * Pure module: no I/O, no dependencies. The CLI (`cli.ts`) is a thin wrapper,
 * and library consumers can import either entry point:
 *
 *   parseMarkdown(source)        → html string (backward compatible)
 *   parseMarkdownDetail(source)  → { html, issues, headings, words }
 *
 * marcus's differentiator (RESEARCH.md): unlike every other converter, it
 * tells you the truth about your input — render-affecting problems come back
 * as line-numbered issues instead of silently wrong HTML.
 *
 * Issue severities:
 *   warning — output probably doesn't match the author's intent; --strict fails on these
 *   info    — deliberate repairs or unsupported-syntax notices; never blocks --strict
 */
/**
 * Normalize CRLF / lone CR to LF and drop a leading BOM (Windows editors and
 * some export tools prepend one; left in place it breaks the first heading and
 * leaks an invisible character into the output).
 */
function normalizeNewlines(input) {
    return input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}
/** Escape a string for inclusion in HTML text content. */
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
/** Escape a value destined for a double-quoted HTML attribute. */
function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, "&quot;");
}
/**
 * Inline-level formatting: code spans, autolinks, safe-mode HTML neutralization,
 * images, links, emphasis.
 *
 * Order matters:
 *  1. code spans are protected first (nothing inside them is formatted, their
 *     content is HTML-escaped),
 *  2. angle autolinks are protected next — they are markdown syntax, not raw
 *     HTML, so they must survive safe-mode escaping,
 *  3. in safe mode remaining `<`/`>` (and bare `&`) are neutralized so untrusted
 *     markup renders as visible text,
 *  4. then images/links/emphasis run (their generated tags are marcus's own),
 *  5. finally the protected runs are restored.
 */
function inline(text, safe) {
    // 1. Protect code spans behind placeholders.
    const codeSpans = [];
    let t = text.replace(/`([^`\n]+)`/g, (_match, code) => {
        codeSpans.push(`<code>${escapeHtml(code)}</code>`);
        return `\u0000${codeSpans.length - 1}\u0001`;
    });
    // 2. Protect angle autolinks: <https://example.com>
    const autolinks = [];
    t = t.replace(/<(https?:\/\/[^ \t>]+)>/g, (_m, url) => {
        autolinks.push(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`);
        return `\u0002${autolinks.length - 1}\u0003`;
    });
    // 3. Safe mode: neutralize HTML. Already-escaped entities (&amp;, &lt;, …)
    // are preserved; a bare '&' is completed so the output stays valid HTML.
    if (safe) {
        t = t
            .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#[0-9]+;|#[xX][0-9a-fA-F]+;)/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
    // 4. Images: ![alt](src "title")
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:[ \t]+"([^"]*)")?\)/g, (_m, alt, src, title) => `<img src="${escapeAttr(src)}"${title ? ` title="${escapeAttr(title)}"` : ""} alt="${escapeAttr(alt)}">`);
    // 5. Links: [label](href "title")
    t = t.replace(/\[([^\]]*)\]\(([^)\s]+)(?:[ \t]+"([^"]*)")?\)/g, (_m, label, href, title) => `<a href="${escapeAttr(href)}"${title ? ` title="${escapeAttr(title)}"` : ""}>${label}</a>`);
    // 6. Emphasis. Guards on `_` prevent italics inside snake_case words.
    t = t.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>");
    t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(?<![\w_])__(?=\S)([\s\S]*?\S)__(?![\w_])/g, "<strong>$1</strong>");
    t = t.replace(/(?<!\*)\*(?=\S)([^*\n]*\S)\*(?!\*)/g, "<em>$1</em>");
    t = t.replace(/(?<![\w_])_(?=\S)([^_\n]*\S)_(?![\w_])/g, "<em>$1</em>");
    t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
    // 7. Restore protected runs.
    t = t.replace(/\u0002(\d+)\u0003/g, (_m, index) => autolinks[Number(index)]);
    t = t.replace(/\u0000(\d+)\u0001/g, (_m, index) => codeSpans[Number(index)]);
    return t;
}
/** Rough prose word count used for stats; markdown markers don't count as letters. */
function countWords(text) {
    return text.replace(/[`*_~]/g, " ").split(/\s+/).filter(Boolean).length;
}
/** HTML-only entry point: diagnostics discarded. */
export function parseMarkdown(source, options) {
    return parseMarkdownDetail(source, options).html;
}
/**
 * Repair common LLM-output artifacts in place (mutates `lines`), logging every
 * change via `addRepair` (0-based line index). Runs only when `fixLlm` is on.
 * Repairs are deliberately conservative:
 *  - heading space: `##Title` → `## Title` (hashes followed by non-space)
 *  - fence-wrapped frontmatter: a first-line fence whose body is a `---`
 *    frontmatter block is unwrapped (fence lines blanked, line numbers stable)
 *  - ` proved`-style artifacts: only when the line consists solely of the
 *    artifact, so prose like "the experiment proved X" is never touched
 * Fence bodies are never modified.
 */
function repairLlmArtifacts(lines, addRepair) {
    // -- 1. fence-wrapped frontmatter at the very start of the document --------
    const opener = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/.exec(lines[0] ?? "");
    if (opener !== null) {
        const char = opener[1][0];
        const length = opener[1].length;
        const closeRe = new RegExp(`^ {0,3}${char}{${length},}\\s*$`);
        let closeIdx = -1;
        for (let j = 1; j < lines.length; j++) {
            if (closeRe.test(lines[j])) {
                closeIdx = j;
                break;
            }
        }
        if (closeIdx > 1) {
            const body = lines.slice(1, closeIdx);
            const firstContent = body.findIndex((entry) => entry.trim() !== "");
            if (firstContent !== -1 &&
                body[firstContent].trim() === "---" &&
                body.slice(firstContent + 1).some((entry) => entry.trim() === "---")) {
                lines[0] = "";
                lines[closeIdx] = "";
                addRepair(0, "repaired-frontmatter-fence", "frontmatter was wrapped in a code fence — unwrapped it (fence lines blanked)");
            }
        }
    }
    // -- 2. per-line artifacts (fence-aware) ------------------------------------
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (fence !== null) {
            const closeRe = new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`);
            if (closeRe.test(line))
                fence = null;
            continue;
        }
        const openMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
        if (openMatch !== null) {
            fence = { char: openMatch[1][0], length: openMatch[1].length };
            continue;
        }
        const heading = /^( {0,3}#{1,6})([^#\s].*)$/.exec(line);
        if (heading !== null) {
            lines[i] = `${heading[1]} ${heading[2]}`;
            addRepair(i, "repaired-heading-space", "heading hashes had no space before the title — inserted one");
            continue;
        }
        // ` proved`-style artifacts: a line consisting solely of (whitespace +
        //) "proved" — the stray code-fence token LLMs emit. Whole-line matches
        // only, so prose like "the experiment proved X" is never touched.
        if (/^\s+proved\s*$/i.test(line)) {
            lines[i] = " proved";
            addRepair(i, "repaired-proved-block", "stray ' proved' artifact normalized to ' proved'");
        }
    }
}
/** Full entry point: HTML plus issues, heading map and word count. */
export function parseMarkdownDetail(source, options) {
    const ctx = {
        issues: [],
        headings: [],
        words: 0,
        lineOffset: 0,
        safe: options?.unsafeHtml !== true,
    };
    const lines = normalizeNewlines(source).split("\n");
    if (options?.fixLlm === true) {
        const pushRepair = (lineIndex, code, message) => {
            ctx.issues.push({ line: lineIndex + 1, code, severity: "info", message });
        };
        repairLlmArtifacts(lines, pushRepair);
    }
    const html = parseBlocks(lines.join("\n"), ctx);
    // Document order: repairs (logged up front) and deferred paragraph checks
    // (reported at the paragraph's first line) would otherwise interleave.
    // Array.prototype.sort is stable, so same-line issues keep insertion order.
    ctx.issues.sort((a, b) => a.line - b.line);
    return { html, issues: ctx.issues, headings: ctx.headings, words: ctx.words };
}
function parseBlocks(source, ctx) {
    const lines = source.split("\n");
    const out = [];
    let paragraph = [];
    let paragraphStart = 0; // index of the first line of the current paragraph
    let listType = null;
    let fence = null;
    let fenceLang = "";
    let fenceBody = [];
    let prevHeadingLevel = 0;
    const addIssue = (lineIndex, code, severity, message) => {
        ctx.issues.push({ line: ctx.lineOffset + lineIndex + 1, code, severity, message });
    };
    /**
     * Render-affecting inline heuristics, checked per text run (paragraph-level
     * so emphasis pairs may legally span lines; single-line for headings/items).
     */
    const inlineChecks = (text, lineIndex) => {
        if (text.replace(/`[^`\n]*`/g, "").includes("`")) {
            addIssue(lineIndex, "unclosed-inline-code", "warning", "unpaired backtick — inline code span may be unclosed");
        }
        if (((text.match(/\*\*/g) ?? []).length) % 2 === 1) {
            addIssue(lineIndex, "unclosed-bold", "warning", "odd number of '**' — bold segment may be unclosed");
        }
        if (((text.match(/~~/g) ?? []).length) % 2 === 1) {
            addIssue(lineIndex, "unclosed-strikethrough", "warning", "odd number of '~~' — strikethrough may be unclosed");
        }
    };
    const flushParagraph = () => {
        if (paragraph.length === 0)
            return;
        inlineChecks(paragraph.join("\n"), paragraphStart);
        out.push(`<p>${inline(paragraph.join("\n"), ctx.safe)}</p>`);
        paragraph = [];
    };
    const closeList = () => {
        if (listType !== null) {
            out.push(`</${listType}>`);
            listType = null;
        }
    };
    const emitFence = () => {
        const langClass = fenceLang !== "" ? ` class="language-${fenceLang}"` : "";
        out.push(`<pre><code${langClass}>${escapeHtml(fenceBody.join("\n"))}\n</code></pre>`);
        fence = null;
        fenceBody = [];
        fenceLang = "";
    };
    // -- frontmatter heuristic (top level only) ---------------------------------
    if (ctx.lineOffset === 0) {
        const firstContent = lines.findIndex((entry) => entry.trim() !== "");
        if (firstContent !== -1 &&
            lines[firstContent] === "---" &&
            lines.slice(firstContent + 1).includes("---")) {
            addIssue(firstContent, "frontmatter-unsupported", "info", "input starts with '---' — YAML frontmatter is not supported yet and renders as thematic breaks");
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // -- fenced code blocks ---------------------------------------------
        if (fence !== null) {
            const close = new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`);
            if (close.test(line)) {
                emitFence();
            }
            else {
                fenceBody.push(line);
            }
            continue;
        }
        const openFence = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/.exec(line);
        if (openFence) {
            const marker = openFence[1];
            flushParagraph();
            closeList();
            fence = { char: marker[0], length: marker.length, startLine: i };
            const info = openFence[2].trim().split(/\s+/)[0] ?? "";
            fenceLang = /^[A-Za-z0-9_-]+$/.test(info) ? info : "";
            continue;
        }
        // -- blank line -------------------------------------------------------
        if (line.trim() === "") {
            flushParagraph();
            continue;
        }
        // -- thematic break ---------------------------------------------------
        if (/^ {0,3}((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/.test(line)) {
            flushParagraph();
            closeList();
            out.push("<hr>");
            continue;
        }
        // -- ATX headings -------------------------------------------------------
        const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
        if (heading) {
            flushParagraph();
            closeList();
            const level = heading[1].length;
            const text = heading[2];
            if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
                addIssue(i, "heading-skip", "warning", `heading level jumps from h${prevHeadingLevel} to h${level} — breaks document outline`);
            }
            prevHeadingLevel = level;
            ctx.headings.push({ level, text, line: ctx.lineOffset + i + 1 });
            ctx.words += countWords(text);
            out.push(`<h${level}>${inline(text, ctx.safe)}</h${level}>`);
            continue;
        }
        // -- blockquote: consecutive "> " lines, parsed recursively -------------
        if (/^ {0,3}>/.test(line)) {
            flushParagraph();
            closeList();
            const quoteLines = [];
            const quoteStart = i;
            while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
                quoteLines.push(lines[i].replace(/^ {0,3}> ?/, ""));
                i++;
            }
            i--; // compensate for the for-loop increment
            const rendered = parseBlocks(quoteLines.join("\n"), {
                issues: ctx.issues,
                headings: ctx.headings,
                words: ctx.words,
                lineOffset: ctx.lineOffset + quoteStart,
                safe: ctx.safe,
            });
            out.push(rendered === "" ? "<blockquote></blockquote>" : `<blockquote>\n${rendered}\n</blockquote>`);
            continue;
        }
        // -- list items ---------------------------------------------------------
        const ulItem = /^ {0,3}[*+-][ \t]+(.*)$/.exec(line);
        const olItem = /^ {0,3}\d{1,9}[.)][ \t]+(.*)$/.exec(line);
        if (ulItem !== null || olItem !== null) {
            flushParagraph();
            const type = ulItem !== null ? "ul" : "ol";
            if (listType !== type) {
                if (listType !== null) {
                    addIssue(i, "mixed-list-markers", "info", "list marker style changed — the previous list was implicitly closed here");
                }
                closeList();
                out.push(`<${type}>`);
                listType = type;
            }
            const text = (ulItem ?? olItem)[1];
            inlineChecks(text, i);
            ctx.words += countWords(text);
            out.push(`<li>${inline(text, ctx.safe)}</li>`);
            continue;
        }
        // -- raw HTML passthrough line --------------------------------------------
        // Unsafe mode: verbatim block, no inline processing.
        // Safe mode (default): falls through to paragraph text, escaped inline.
        const looksLikeHtml = /^ {0,3}<[A-Za-z/!]/.test(line);
        if (looksLikeHtml && !ctx.safe) {
            flushParagraph();
            closeList();
            out.push(line.trim());
            continue;
        }
        // -- paragraph text; interrupts an open list ------------------------------
        if (listType !== null) {
            addIssue(i, "list-interrupted", "info", "non-list line implicitly closes the open list here");
            closeList();
        }
        if (looksLikeHtml) {
            addIssue(i, "html-escaped", "info", "raw HTML here was escaped to text — pass --unsafe to keep it as markup");
        }
        if (paragraph.length === 0)
            paragraphStart = i;
        paragraph.push(line);
        ctx.words += countWords(line);
    }
    // -- end of input ------------------------------------------------------------
    if (fence !== null) {
        addIssue(fence.startLine, "unclosed-fence", "warning", "code fence opened here is never closed — everything after it renders as code");
        emitFence();
    }
    flushParagraph();
    closeList();
    return out.join("\n");
}
