# Changelog

All notable changes to Slate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Formatting and lint rules now come from the shared `@larrydarko/lint-config` package.

## [2.0.1] - 2026-08-28

### Removed

- macOS binaries. Releases now carry Linux packages only. macOS users can still build from source with `npm run build:mac`.

## [2.0.0] - 2026-08-28

### Changed

- Updated Electron to 44.

### Removed

- Windows builds.
- Intel Mac builds. macOS releases are Apple Silicon only.

### Security

- Updated the security reporting policy.

## [1.3.1] - 2026-06-05

### Added

- A warning before closing with unsaved changes, since Slate does not autosave.

### Security

- Updated dependencies, including Vitest 4.1.0.

## [1.3.0] - 2026-03-27

### Changed

- The window size scales with the screen instead of using a fixed size.
- The custom title bar was replaced by the native one.
- New icons.

## [1.2.9] - 2026-03-17

### Changed

- Rewrote the app in TypeScript on electron-vite, as part of a large internal refactor.

### Fixed

- Corrupted text in the toolbar.

### Security

- Updated dependencies to fix vulnerabilities.

## 1.2.0 – 1.2.8 - 2026-02-23 to 2026-03-08

Before 1.2.9, the version was bumped on almost every commit, so earlier versions are grouped by minor version.

### Added

- Undo (1.2.0).
- The OS recognizes `.slate` files and can open them with Slate by default (1.2.0), with a custom file icon (1.2.1) and a Windows file icon (1.2.8).
- Percentage format and configurable decimal places (1.2.2).
- Row and column reordering by drag and drop (1.2.4).
- Column sorting in ascending and descending order (1.2.7).
- URL and link support in cells (1.2.8).
- Slate is now open source under the MIT license (1.2.8).

### Changed

- Reduced cell opacity and removed the default text color on result cells (1.2.2).
- Multi-selecting rows and columns now uses Shift + click only, to make room for reordering (1.2.4).
- New icons (1.2.3, 1.2.5).

### Fixed

- Renaming a table no longer resets the chart series that use it (1.2.3).
- Empty rows and columns can be removed by dragging, not only created (1.2.4).
- Formulas across external tables (1.2.6).
- Formula bar styling (1.2.6).

### Security

- Security fixes (1.2.2).

## 1.1.0 – 1.1.9 - 2026-02-16 to 2026-02-23

### Added

- Charts, initially unstable (1.1.0). Individual cells can be selected as chart data (1.1.5), and radar charts were added (1.1.8).
- Copy, cut and paste across multiple cells (1.1.1).
- Small sticky notes on cells (1.1.2).
- Cross-table and cross-canvas cell references, with a button for easier formula selection (1.1.3).
- Automatic sum when selecting cells for a formula (1.1.4).
- Highlighting of the cells a formula uses (1.1.7).
- Selecting and deleting several rows and columns at once, and handles on the bottom and right of tables that add rows and columns by dragging (1.1.9).

### Changed

- Better styling (1.1.4).
- Smaller minimum cell width (1.1.7).

### Fixed

- Cross-canvas formulas (1.1.6).
- The chart grid in dark mode, and series and dataset issues in charts (1.1.8).

## 1.0.0 – 1.0.9 - 2026-02-09 to 2026-02-16

### Added

- Initial release (1.0.0).
- Merging and unmerging rows and columns (1.0.2).
- Cell types (1.0.3).
- Cell and text colors (1.0.4).
- Multiple canvases, up to 10 per `.slate` file (1.0.5).
- Zoom (1.0.6).
- Multi-selection of rows and columns (1.0.7).
- Text boxes outside of tables, with bold and italic styling (1.0.8).
- Font selection (1.0.9).

### Changed

- Style changes (1.0.2).

[Unreleased]: https://github.com/larrydarko1/Slate/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/larrydarko1/Slate/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/larrydarko1/Slate/compare/v1.3.1...v2.0.0
[1.3.1]: https://github.com/larrydarko1/Slate/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/larrydarko1/Slate/compare/v1.2.9...v1.3.0
[1.2.9]: https://github.com/larrydarko1/Slate/compare/v1.2.8...v1.2.9
