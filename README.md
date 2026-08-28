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

- Node.js (v18+ recommended)
- npm

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
- **Testing:** Vitest + jsdom
- **Linting:** ESLint (flat config) + Prettier
- **Git Hooks:** Husky + lint-staged + commitlint
- **Build:** electron-vite + Electron Builder

## Project Structure

```
slate/
├── electron.vite.config.ts        # Unified build config (main + preload + renderer)
├── vitest.config.ts               # Vitest config (node + jsdom projects)
├── eslint.config.js               # ESLint flat config (TS + Vue + Prettier)
├── commitlint.config.js           # Conventional commit enforcement
├── src/
│   ├── main/                      # Electron main process (TypeScript)
│   │   ├── index.ts               #   BrowserWindow, IPC handlers, app lifecycle
│   │   └── lib/
│   │       └── validation.ts      #   Input validation (assertSafeFileName)
│   ├── preload/                   # contextBridge — renderer ↔ main API surface
│   │   └── index.ts
│   └── renderer/                  # Vue 3 SPA
│       ├── App.vue                #   Root component (provides spreadsheet state)
│       ├── main.ts                #   Vue entry point
│       ├── style.scss             #   Global styles & theme variables
│       ├── components/            #   Vue components
│       │   ├── SpreadsheetTable.vue    # Table grid, cell editing, keyboard nav
│       │   ├── CanvasWorkspace.vue     # Infinite canvas with pan/zoom
│       │   ├── CanvasChart.vue         # Chart element on canvas
│       │   ├── CanvasTextBox.vue       # Rich text box element
│       │   ├── CanvasTabs.vue          # Multi-canvas tab bar & zoom controls
│       │   ├── Toolbar.vue             # App & formatting toolbar
│       │   ├── FormulaBar.vue          # Formula input with token coloring
│       │   ├── TitleBar.vue            # Custom title bar
│       │   ├── ContextMenu.vue         # Reusable right-click menu
│       │   ├── chart/                  # Chart sub-components
│       │   ├── table/                  # Table sub-components (notes, popups)
│       │   └── toolbar/               # Toolbar sub-components (pickers, selectors)
│       ├── composables/           #   Composable modules
│       │   ├── useSpreadsheet.ts       # Orchestrator — wires all sub-composables
│       │   ├── useChartData.ts         # Chart.js data binding & theme integration
│       │   ├── useDragResize.ts        # Generic drag & resize handler
│       │   ├── spreadsheet/            # Domain composables (state, cells, formulas, …)
│       │   │   ├── state.ts            #   Centralized reactive state
│       │   │   ├── helpers.ts          #   Finder functions & selection utilities
│       │   │   ├── useCells.ts         #   Cell CRUD & formatting
│       │   │   ├── useEditing.ts       #   Inline editing lifecycle
│       │   │   ├── useSelection.ts     #   Cell & range selection
│       │   │   ├── useCanvases.ts      #   Canvas CRUD & zoom
│       │   │   ├── useTables.ts        #   Table CRUD, row/col operations
│       │   │   ├── useMerge.ts         #   Cell merge/unmerge
│       │   │   ├── useClipboard.ts     #   Copy/paste with formula shifting
│       │   │   ├── useFormulas.ts      #   Formula bar integration
│       │   │   ├── useCharts.ts        #   Chart CRUD & data selection
│       │   │   ├── useTextBoxes.ts     #   Text box CRUD
│       │   │   ├── useFileOps.ts       #   Save/open/new file operations
│       │   │   ├── useFormulaEngine.ts #   Recalculation & reference rewriting
│       │   │   ├── useUndoRedo.ts      #   Undo/redo stack management
│       │   │   ├── useTableSort.ts     #   Column sorting
│       │   │   ├── useTableReorder.ts  #   Row/column drag reordering
│       │   │   └── engine/             #   Formula engine (pure functions)
│       │   │       ├── tokenizer.ts    #     Lexer — formula string → tokens
│       │   │       ├── parser.ts       #     Recursive-descent → AST
│       │   │       ├── evaluator.ts    #     AST → computed value
│       │   │       ├── formula.ts      #     Public API (evaluate, extractRefs)
│       │   │       └── cellTypes.ts    #     Type detection, parsing, formatting
│       │   └── table/                  # Table-level composables
│       │       ├── useFillHandle.ts    #   Fill-handle drag logic
│       │       ├── useRowColReorder.ts #   Row/column drag reorder UI
│       │       ├── useTableCellRendering.ts  # Cell classes, styles, merge helpers
│       │       ├── useTableContextMenus.ts   # Right-click menu actions
│       │       └── useTableNotes.ts          # Note popup & editor state
│       └── types/                 #   TypeScript definitions
│           ├── spreadsheet.ts         # Data types, factory functions, constants
│           └── electron.d.ts          # Preload API type declarations
├── tests/                         # Mirrors src/ — Vitest + jsdom
├── public/                        # Static assets
└── build/                         # App icons (.icns, .ico, .png)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

**Made with Electron, Vue 3, and a love for design-forward software.**
