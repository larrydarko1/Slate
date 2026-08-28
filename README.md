# Slate

![License](https://img.shields.io/github/license/larrydarko1/slate)
![Issues](https://img.shields.io/github/issues/larrydarko1/slate)
![Pull Requests](https://img.shields.io/github/issues-pr/larrydarko1/slate)

Slate is a **free and open-source, canvas-based spreadsheet app** for desktop built with **Electron**, **Vue 3**, and TypeScript. Inspired by Apple Numbers, Slate brings a design-forward, layout-first spreadsheet experience to every platform — tables, charts, and text boxes arranged freely on an infinite canvas.

> **Note:** This app runs natively on **Desktop** (macOS and Linux). All files are saved as `.slate` files on your local machine.

# Demo

![Slate Demo](./public/demo.png)

## Features

### Canvas & Layout

- **Canvas-based workspace** — tables, charts, and text boxes on an infinite pannable, zoomable canvas
- **Multi-canvas support** — organize your work across multiple canvases (like sheets/tabs)
- **Rich text boxes** — free-form text with font, color, alignment, and border controls
- **Dark & light themes**

### Spreadsheet

- **Formula engine** — 29 built-in functions (SUM, AVERAGE, IF, CONCAT, and more) with cell/range references
- **Cross-table & cross-canvas references** — reference cells across tables and canvases in formulas
- **Cell formatting** — bold, italic, text/fill colors, alignment, font family
- **Cell merging** — merge and unmerge arbitrary rectangular regions
- **Smart cell types** — auto-detection of numbers, percentages, currency (USD/EUR), URLs, booleans, and text

### Charts

- **7 chart types** — Bar, Line, Area, Pie, Doughnut, Scatter, and Radar
- **Auto-updating data binding** — charts update live as spreadsheet data changes

### Files

- **Native file format** — `.slate` files (JSON-based, versioned)
- **Cross-platform** — macOS and Linux builds

## Getting Started

### Prerequisites

- Node.js 24 or newer
- npm 11 or newer

Both are enforced by the `engines` field, and CI builds on the same major.

### Setup

1. **Clone the repository**

```sh
git clone https://github.com/larrydarko1/slate.git
cd slate
```

2. **Install dependencies**

```sh
npm install
```

3. **Run in development mode**

```sh
npm run dev
```

### Testing

```sh
npm test            # single run
npm run test:watch  # watch mode
```

### Building for Production

```sh
# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
```

Builds are output to the `dist-electron/` directory:

- **macOS:** `.dmg` installer (arm64 and x64)
- **Linux:** `.AppImage`, `.deb`, `.rpm`, and `.tar.gz`

Building the `.rpm` needs the `rpm` tool on the build machine (`sudo apt-get install rpm`
on Debian/Ubuntu); the other Linux targets have no extra prerequisite.

## Tech Stack

- **Desktop:** Electron 40, electron-vite 5
- **Frontend:** Vue 3, TypeScript (strict), SCSS
- **Charts:** [Chart.js](https://www.chartjs.org/) + [vue-chartjs](https://vue-chartjs.org/)
- **IPC validation:** [Zod](https://zod.dev/) — every channel argument is parsed before use
- **Logging:** electron-log, rotating at 1 MB
- **Testing:** Vitest + jsdom, 80% coverage enforced
- **Linting:** ESLint (flat config, plus custom in-repo rules) + Prettier + Stylelint
- **Git Hooks:** Husky + lint-staged + commitlint
- **Build:** electron-vite + Electron Builder

## Project Structure

```
slate/
├── electron.vite.config.ts        # Unified build config (main + preload + renderer)
├── vitest.config.ts               # Vitest config (node + jsdom projects)
├── eslint.config.js               # ESLint flat config (TS + Vue + Prettier)
├── commitlint.config.js           # Conventional commit enforcement
├── eslint/                        # Custom in-repo ESLint rules, one file per concern
├── scripts/
│   ├── check/                     # The 14 quality gates run by `npm run ci:check`
│   └── lib/                       # Shared helpers for the gates
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               #   BrowserWindow, navigation & permission policy,
│   │   │                          #   single-instance lock, IPC registration
│   │   ├── lib/
│   │   │   ├── config.ts          #   The only module that reads process.env
│   │   │   └── logger.ts          #   electron-log wrapper, 1 MB rotation
│   │   └── services/              #   One module per IPC domain; each owns its channels
│   │       ├── file.ts            #   dialog:save/open, file:write/read — atomic writes
│   │       ├── log.ts             #   log:error/warn/info/debug
│   │       └── shell.ts           #   shell:openExternal — http/https only
│   ├── preload/                   # contextBridge — the one renderer ↔ main bridge
│   │   └── index.ts               #   Every channel a string literal, never a parameter
│   ├── schemas/                   # The IPC wire contract, shared by preload and main
│   │   ├── electron.d.ts          #   The contextBridge contract
│   │   ├── file.ts                #   Path/traversal/extension/size rules (Zod)
│   │   ├── log.ts                 #   Log entry shape
│   │   └── shell.ts               #   External URL scheme allowlist
│   └── renderer/                  # Vue 3 SPA
│       ├── index.html             #   Document shell and the Content Security Policy
│       ├── App.vue                #   Root component (provides spreadsheet state)
│       ├── main.ts                #   Vue entry point
│       ├── styles/                #   SCSS design system
│       │   ├── index.scss         #     Barrel — injected into every SFC by Vite
│       │   ├── global.scss        #     Entry point — imported once by main.ts
│       │   ├── _tokens.scss       #     Custom properties shared by every theme
│       │   ├── _themes.scss       #     Per-theme palettes (light/dark)
│       │   ├── _variables.scss    #     Typography, size, motion, depth, opacity scales
│       │   ├── _mixins.scss       #     Multi-declaration patterns
│       │   ├── _base.scss         #     Document typography, Electron drag regions
│       │   └── components/        #     Shared button, canvas & placeholder styles
│       ├── components/            #   Vue components
│       │   ├── SpreadsheetTable.vue    # Table grid, cell editing, keyboard nav
│       │   ├── CanvasWorkspace.vue     # Infinite canvas with pan/zoom
│       │   ├── CanvasChart.vue         # Chart element on canvas
│       │   ├── CanvasTextBox.vue       # Rich text box element
│       │   ├── CanvasTabs.vue          # Multi-canvas tab bar & zoom controls
│       │   ├── Toolbar.vue             # App & formatting toolbar
│       │   ├── FormulaBar.vue          # Formula input with token coloring
│       │   ├── ContextMenu.vue         # Reusable right-click menu
│       │   ├── canvas/                 # ResizeHandles
│       │   ├── chart/                  # ChartConfigPanel
│       │   ├── table/                  # NotePopup, NoteEditor
│       │   └── toolbar/                # Color, font & cell-type pickers
│       ├── composables/           #   Composable modules
│       │   ├── useSpreadsheet.ts       # Orchestrator — wires all sub-composables
│       │   ├── useChartData.ts         # Chart.js data binding & theme integration
│       │   ├── useDragResize.ts        # Shared drag-to-move & resize for canvas objects
│       │   ├── spreadsheet/            # Domain factories — createX, see note below
│       │   │   ├── state.ts            #   Shared reactive state
│       │   │   ├── helpers.ts          #   Finders, z-index, selection & name patterns
│       │   │   ├── cells.ts            #   Cell access, values, formatting, notes
│       │   │   ├── editing.ts          #   Editing lifecycle — commit, cancel, clear
│       │   │   ├── selection.ts        #   Cell/row/column/range selection & keyboard nav
│       │   │   ├── canvases.ts         #   Canvas CRUD, zoom, tab reordering
│       │   │   ├── tables.ts           #   Table CRUD, row/column & bulk operations
│       │   │   ├── merge.ts            #   Cell merge/unmerge
│       │   │   ├── clipboard.ts        #   Copy, cut, paste, fill
│       │   │   ├── formulas.ts         #   Formula edit mode, tokens, reference insertion
│       │   │   ├── charts.ts           #   Chart CRUD & data selection
│       │   │   ├── textBoxes.ts        #   Text box CRUD
│       │   │   ├── fileOps.ts          #   Serialization, deserialization, migration
│       │   │   ├── formulaEngine.ts    #   Recalculation, reference & name rewriting
│       │   │   ├── undoRedo.ts         #   Undo/redo stack, auto-nesting, batching
│       │   │   ├── tableSort.ts        #   Column sorting
│       │   │   ├── tableReorder.ts     #   Row/column reordering
│       │   │   └── engine/             #   Formula engine (pure functions)
│       │   │       ├── tokenizer.ts    #     Lexer — formula string → tokens
│       │   │       ├── parser.ts       #     Recursive-descent → AST
│       │   │       ├── evaluator.ts    #     AST → computed value (29 functions)
│       │   │       ├── formula.ts      #     Public API (evaluate, extractRefs)
│       │   │       └── cellTypes.ts    #     Type detection, parsing, formatting
│       │   └── table/                  # Table-level UI composables
│       │       ├── useFillHandle.ts          # Drag-to-fill (autofill)
│       │       ├── useRowColReorder.ts       # Header selection & drag-to-reorder
│       │       ├── useTableStructure.ts      # Table move, column resize, add row/col
│       │       ├── useTableCellRendering.ts  # Cell class & style computation
│       │       ├── useTableContextMenus.ts   # Right-click menu builders
│       │       └── useTableNotes.ts          # Note popup & editor state
│       └── types/                 #   TypeScript definitions
│           ├── spreadsheet.ts         # Data types, factory functions, constants
│           └── contextMenu.ts         # Right-click menu shape
├── tests/                         # Mirrors src/ — Vitest + jsdom
├── public/                        # Static assets
└── build/                         # App icons and DMG background
```

> **Naming note:** the two `composables/` subtrees follow different conventions on
> purpose. Modules under `spreadsheet/` are **factories** — they export `createCells`,
> `createTables`, … and are instantiated once by `useSpreadsheet.ts`, closing over the
> shared `state.ts`. Modules under `table/` (and the three at the top level) are true
> **composables** — they export `useFillHandle`, `useTableNotes`, … and own their own
> reactive state, so each is called per component instance. A file whose name starts
> with `use` must export that exact name; `code:check` enforces it.

## Quality Gates

Beyond lint and tests, the repo enforces its own architecture. `npm run ci:check` runs
the same list CI does, so a red check is always reproducible locally:

| Script            | Enforces                                                            |
| ----------------- | ------------------------------------------------------------------- |
| `audit:check`     | No high/critical production advisories outside a reasoned allowlist |
| `pkg:check`       | Manifest metadata, semver ranges, field order, `os` ↔ build parity  |
| `pipeline:check`  | Job timeouts, SHA-pinned actions, least-privilege workflow tokens   |
| `code:check`      | Casing, file-length ratchet, SFC block order, comment formats       |
| `declorder:check` | Canonical declaration order within every module                     |
| `html:check`      | Document shell, CSP directives, no remote subresources              |
| `scss:check`      | Token parity across themes, the style barrel, no remote assets      |
| `refactor:check`  | No stray deferral markers                                           |
| `ipc:check`       | Every channel documented, reachable, validated, and bridged         |
| `security:check`  | Electron process model, navigation, permissions, HTML sinks         |
| `error:check`     | IPC handlers contain their failures; no silent swallows             |
| `dup:check`       | Copy-paste duplication                                              |
| `dead:check`      | Unused files, exports and dependencies                              |
| `test:check`      | Test layout, naming and coverage thresholds                         |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

**Made with Electron, Vue 3, and a love for design-forward software.**
