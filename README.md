# Slate

A free and open-source spreadsheet app inspired by Apple Numbers. Built with Vue 3, TypeScript, and Electron.

Slate brings the canvas-based, design-forward spreadsheet experience to every platform — macOS, Windows, and Linux.

## Features

- **Canvas-based workspace** — tables, charts, and text boxes on an infinite pannable, zoomable canvas
- **Multi-canvas support** — organize your work across multiple canvases (like sheets/tabs)
- **Formula engine** — 29 built-in functions (SUM, AVERAGE, IF, CONCAT, etc.) with cell/range references
- **Cross-table & cross-canvas references** — reference cells across tables and canvases in formulas
- **7 chart types** — Bar, Line, Area, Pie, Doughnut, Scatter, and Radar with auto-updating data binding
- **Rich text boxes** — free-form text with font, color, alignment, and border controls
- **Cell formatting** — bold, italic, text/fill colors, alignment, font family
- **Cell merging** — merge and unmerge arbitrary rectangular regions
- **Smart cell types** — auto-detection of numbers, percentages, currency (USD/EUR), URLs, booleans, and text
- **Dark & light themes**
- **Native file format** — `.slate` files (JSON-based, versioned)
- **Cross-platform** — macOS, Windows, and Linux builds

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (comes with Node.js)

### Installation

```bash
git clone https://github.com/larrydarko1/slate.git
cd slate
npm install
```

### Development

```bash
npm run dev
```

This starts Vite and Electron concurrently in development mode.

### Testing

```bash
npm test          # watch mode
npm run test:run  # single run
```

### Building

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

Builds are output to the `dist-electron/` directory.

## Tech Stack

- **Framework:** [Vue 3](https://vuejs.org/) (Composition API) + TypeScript
- **Desktop:** [Electron](https://www.electronjs.org/)
- **Build:** [Vite](https://vitejs.dev/) + [electron-builder](https://www.electron.build/)
- **Charts:** [Chart.js](https://www.chartjs.org/) + [vue-chartjs](https://vue-chartjs.org/)
- **Styling:** SCSS
- **Testing:** [Vitest](https://vitest.dev/)

## Project Structure

```
slate/
├── index.html                # Electron entry HTML
├── vite.config.ts            # Vite + Vitest config
├── generate-icons.sh         # Icon generation script (macOS iconutil)
├── electron/                 # Electron main process & preload
│   ├── main.cjs
│   └── preload.cjs
├── src/
│   ├── App.vue               # Root Vue component
│   ├── main.ts               # Vue app entry point
│   ├── style.scss            # Global styles
│   ├── vite-env.d.ts         # Vite client type declarations
│   ├── assets/               # Source assets (PSD files, etc.)
│   ├── components/           # Vue components
│   │   ├── CanvasWorkspace.vue   # Infinite canvas with pan/zoom
│   │   ├── SpreadsheetTable.vue  # Table grid & cell editing
│   │   ├── CanvasChart.vue       # Chart element on canvas
│   │   ├── CanvasTextBox.vue     # Rich text box element
│   │   ├── CanvasTabs.vue        # Multi-canvas tab bar
│   │   ├── Toolbar.vue           # Main toolbar
│   │   ├── FormulaBar.vue        # Formula input bar
│   │   ├── TitleBar.vue          # Custom title bar
│   │   └── ContextMenu.vue       # Right-click context menu
│   ├── composables/          # Vue composables
│   │   └── useSpreadsheet.ts     # Core spreadsheet state & logic
│   ├── engine/               # Formula parser & cell type system
│   │   ├── formula.ts            # Formula tokenizer, parser & evaluator
│   │   └── cellTypes.ts          # Cell type detection & parsing
│   └── types/                # TypeScript type definitions
│       ├── spreadsheet.ts        # Spreadsheet data types
│       └── electron.d.ts         # Electron API type declarations
├── public/                   # Static assets (icons, logos)
└── build/                    # Build resources (app icons, .icns)
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get involved.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

This project is licensed under the [MIT License](LICENSE).
