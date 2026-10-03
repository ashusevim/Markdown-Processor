/**
 * Library entry point:
 *
 *   import { parseMarkdown } from "markdown-processor";              // → html
 *   import { parseMarkdownDetail } from "markdown-processor";        // → + issues/headings/stats
 *
 * The executable entry point is `dist/cli.js` (see the `bin` field).
 */
export { parseMarkdown, parseMarkdownDetail } from "./parse.js";
export { VERSION } from "./version.js";
