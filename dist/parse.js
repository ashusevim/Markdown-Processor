/**
 * marcus core parser — Markdown → HTML.
 *
 * Pure module: no I/O, no dependencies. The CLI (`cli.ts`) is a thin wrapper,
 * and library consumers can `import { parseMarkdown }` directly.
 *
 * Architecture note (RESEARCH.md): the line-based state machine below is the
 * carrier for phase 2 diagnostics (line numbers for warnings) and phase 3
 * safe-mode escaping — those phases extend this file, they don't rewrite it.
 */
/** Normalize CRLF / lone CR to LF so regexes and line handling stay predictable. */
function normalizeNewlines(input) {
    return input.replace(/\r\n?/g, "\n");
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
 * Inline-level formatting: code spans, images, links, emphasis, autolinks.
 * Order matters: code spans are protected first (nothing inside them is
 * formatted, their content is HTML-escaped), then images/links (so emphasis
 * rules never touch URL attributes), then emphasis, then code spans restored.
 */
function inline(text) {
    // 1. Protect code spans behind placeholders.
    const codeSpans = [];
    let t = text.replace(/`([^`\n]+)`/g, (_match, code) => {
        codeSpans.push(`<code>${escapeHtml(code)}</code>`);
        return `\u0000${codeSpans.length - 1}\u0001`;
    });
    // 2. Images: ![alt](src "title")
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:[ \t]+"([^"]*)")?\)/g, (_m, alt, src, title) => `<img src="${escapeAttr(src)}"${title ? ` title="${escapeAttr(title)}"` : ""} alt="${escapeAttr(alt)}">`);
    // 3. Links: [label](href "title")
    t = t.replace(/\[([^\]]*)\]\(([^)\s]+)(?:[ \t]+"([^"]*)")?\)/g, (_m, label, href, title) => `<a href="${escapeAttr(href)}"${title ? ` title="${escapeAttr(title)}"` : ""}>${label}</a>`);
    // 4. Emphasis. Guards on `_` prevent italics inside snake_case words.
    t = t.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>");
    t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(?<![\w_])__(?=\S)([\s\S]*?\S)__(?![\w_])/g, "<strong>$1</strong>");
    t = t.replace(/(?<!\*)\*(?=\S)([^*\n]*\S)\*(?!\*)/g, "<em>$1</em>");
    t = t.replace(/(?<![\w_])_(?=\S)([^_\n]*\S)_(?![\w_])/g, "<em>$1</em>");
    t = t.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
    // 5. Autolinks in angle form: <https://example.com>
    t = t.replace(/<(https?:\/\/[^ \t>]+)>/g, '<a href="$1">$1</a>');
    // 6. Restore code spans.
    t = t.replace(/\u0000(\d+)\u0001/g, (_m, index) => codeSpans[Number(index)]);
    return t;
}
/**
 * Convert Markdown source to HTML.
 *
 * Block-level constructs (headings, fences, quotes, lists, paragraphs) are
 * detected line by line; inline formatting is applied per text run.
 * Returns a fragment — no <html>/<body> wrapper, ready to embed or pipe.
 */
export function parseMarkdown(source) {
    const lines = normalizeNewlines(source).split("\n");
    const out = [];
    let paragraph = [];
    let listType = null;
    let fence = null;
    let fenceLang = "";
    let fenceBody = [];
    const flushParagraph = () => {
        if (paragraph.length === 0)
            return;
        out.push(`<p>${inline(paragraph.join("\n"))}</p>`);
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
            fence = { char: marker[0], length: marker.length };
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
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }
        // -- blockquote: consecutive "> " lines, parsed recursively -------------
        if (/^ {0,3}>/.test(line)) {
            flushParagraph();
            closeList();
            const quoteLines = [];
            while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
                quoteLines.push(lines[i].replace(/^ {0,3}> ?/, ""));
                i++;
            }
            i--; // compensate for the for-loop increment
            const inner = parseMarkdown(quoteLines.join("\n")).trim();
            out.push(inner === "" ? "<blockquote></blockquote>" : `<blockquote>\n${inner}\n</blockquote>`);
            continue;
        }
        // -- list items ---------------------------------------------------------
        const ulItem = /^ {0,3}[*+-][ \t]+(.*)$/.exec(line);
        const olItem = /^ {0,3}\d{1,9}[.)][ \t]+(.*)$/.exec(line);
        if (ulItem !== null || olItem !== null) {
            flushParagraph();
            const type = ulItem !== null ? "ul" : "ol";
            if (listType !== type) {
                closeList();
                out.push(`<${type}>`);
                listType = type;
            }
            out.push(`<li>${inline((ulItem ?? olItem)[1])}</li>`);
            continue;
        }
        // -- raw HTML passthrough line (kept verbatim, no inline processing) ----
        if (/^ {0,3}<[A-Za-z/!]/.test(line)) {
            flushParagraph();
            closeList();
            out.push(line.trim());
            continue;
        }
        // -- paragraph text; interrupts an open list ------------------------------
        if (listType !== null)
            closeList();
        paragraph.push(line);
    }
    // -- end of input ------------------------------------------------------------
    if (fence !== null)
        emitFence(); // unclosed fence: repair by closing implicitly
    flushParagraph();
    closeList();
    return out.join("\n");
}
