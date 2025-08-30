# Markdown Processor (marcus)

CLI that converts a Markdown file to HTML and writes the result to stdout.

## Currently supported
- Headings: # ... ######
- Horizontal rules: ---  ***  ___
- Blockquotes: > quote
- Unordered lists: * / - / + item
- Ordered lists: 1. item
- Bold: **text** or __text__
- Strikethrough: ~~text~~
- Inline code: `code`
- Images: ![alt](src)
- Raw HTML passthrough lines (not wrapped)
- Basic paragraph wrapping (non-empty, non-processed lines)

## Install

Local (development):
```bash
git clone <repo>
cd markdown-processor
npm install
npm run build
```

Global (exposes `marcus`):
```bash
npm install -g .
```

## Usage
```bash
marcus <file.md>
```
Example:
```bash
marcus README.md > README.html
```

Programmatic (stdout piping):
```bash
marcus test.md | grep "<h2>"
```

## Development
Watch mode (needs tsx if desired—currently not listed as dep):
```bash
npm run dev
```
Build:
```bash
npm run build
```
Run built artifact:
```bash
npm start README.md
```

## Exit Codes
- 0 success
- 1 file read error

## Limitations
The parser is order-dependent, does not fully validate Markdown, and may mis-handle edge cases (mixed lists, nested structures, inline formatting inside list items). Treat output as experimental.

## Contributing
Issues & PRs welcome. Keep additions small and tested.

## License
MIT (recommended)