# JSON Editor Desktop

An offline Electron desktop app inspired by [JSON Editor Online](https://jsoneditoronline.org/), built on the same open-source editor engine ([svelte-jsoneditor](https://github.com/josdejong/svelte-jsoneditor)) that powers the website.

Not affiliated with JSON Editor Online or Jos de Jong. The editor engine and JSON repair library this app builds on are his excellent open-source work, released under the Apache-2.0 license.

Everything runs locally. No network access needed at runtime.

## Features

- Tree mode, text mode, and table mode (per panel, switchable any time)
- Two panels for compare: open a file in each, click Compare to see all differences (added / removed / changed with paths)
- Transform / query with 4 query languages:
  - JavaScript expression: `json.users.filter(u => u.age > 18)`
  - lodash: `_.map(json.users, "name")`
  - JMESPath: `users[?age > \`18\`].name`
  - jq: `.users[].name`
  - Preview before applying; result can replace the left or right document
- JSON repair: broken JSON is repaired automatically on load when possible (same jsonrepair library as the site), with a manual repair prompt when not
- JSON Schema validation: paste a schema, get error counts in the status bar
- CSV import: drop a `.csv` file and it converts to JSON (delimiter auto-detected, quoted fields supported)
- CSV export: Export CSV button flattens nested objects to columns
- Open / Save via native OS dialogs (JSON, JSONC, NDJSON, JSONL, HAR, ipynb)
- Drag-and-drop a file onto either panel to load it
- Copy formatted / copy raw to clipboard
- Dark mode (persisted) with light/dark toggle
- Recent files list and settings persisted per user
- Keyboard shortcuts: Ctrl/Cmd+O open, Ctrl/Cmd+S save, Ctrl/Cmd+D dark mode
- Large file support from the underlying editor engine (lazy rendering tree mode)

## Development

```bash
npm install
npm run build     # build renderer into dist/
npm start         # launch Electron (add --no-sandbox when running as root)
```

## Packaging

```bash
npm run dist:linux   # AppImage
npm run dist:win     # Windows portable
npm run dist:mac     # macOS (run on a Mac)
```

## Architecture

- `main.cjs` - Electron main process: native file dialogs, settings persistence, menu, IPC
- `preload.cjs` - contextBridge API exposed to the renderer (`window.desktop`)
- `src/App.svelte` - two-panel shell: toolbar, mode switches, drag-drop, compare, status bar
- `src/Modal.svelte` - Transform and JSON Schema modals
- `src/lib/transform.js` - JS / lodash / JMESPath / jq query engines
- `src/lib/diff.js` - recursive deep-diff with path tracking
- `src/lib/csv.js` - RFC 4180 CSV parser/serializer with delimiter detection
- `src/lib/utils.js` - helpers

jq support uses jq-wasm (real jq compiled to WebAssembly, runs fully offline).
