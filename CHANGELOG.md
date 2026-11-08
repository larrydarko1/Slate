# Changelog

All notable changes to Slate are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Stepper cells, as in Numbers. Choose Stepper from the cell type menu and each selected cell holds a number from 0 to 100. Select one and two buttons appear beside its number: click them to step it down or up by 1, or press Alt+Down or Alt+Up to step every stepper in the selection. A button turns off at the end of the range, and an empty stepper's first step takes it to 0. Typing any number from 0 to 100 keeps it, decimals included; typing anything else, such as 150, keeps what was typed and makes the cell an ordinary one. Formulas read a stepper as its number and skip empty ones. Making a cell a stepper keeps a number from 0 to 100, makes an empty cell an empty stepper, and leaves anything else as it is. A formula cell set to Stepper shows its result as a plain number. Copying, pasting and filling keep steppers as steppers; a fill repeats them rather than counting on. Files that contain stepper cells cannot be opened by earlier versions of Slate.
- Star rating cells, as in Numbers. Choose Star rating from the cell type menu and each selected cell shows five stars. Click a star to give that many, and click the same star again to clear the rating. With star ratings selected, type 1 to 5 to rate them all, or 0 or Delete to clear them. Clicking elsewhere in the cell only selects it. Formulas read a rating as its number, and skip cells nobody has rated, so `=AVERAGE` gives the average of the ratings actually given. Making a cell a star rating turns a whole number from 1 to 5 into that many stars, an empty cell or 0 into an unrated one, and leaves anything else as it is. A formula cell set to Star rating shows its result as stars that cannot be clicked, or as a plain number when it is not a whole number from 0 to 5. Files that contain star rating cells cannot be opened by earlier versions of Slate.
- Checkbox cells, as in Numbers. Choose Checkbox from the cell type menu and each selected cell shows a box; an empty cell starts unticked. Click the box to tick or untick it, or select checkboxes and press Space to set them all to the opposite of the active one. Clicking elsewhere in the cell only selects it. A checkbox holds TRUE or FALSE, so formulas such as `=IF(B2, "Done", "To do")` can read it, and typing TRUE or FALSE into one ticks or unticks it. Deleting a checkbox's contents unticks it rather than removing the box; change the cell's type to remove it. Making a cell a checkbox ticks it for TRUE or any number other than 0, and leaves other text as it is. A formula cell set to Checkbox shows its result as a box that cannot be clicked. Typing TRUE into an ordinary cell still gives plain TRUE, not a checkbox. Files that contain checkbox cells cannot be opened by earlier versions of Slate.
- Move cells by dragging, the way Numbers does it. Press and hold a selection until it lifts, drag it, and let go where it should land; Escape puts it back. Moved formulas keep pointing at the cells they used, references to the moved cells follow them (from other tables and charts too), and a reference to a cell the block lands on becomes `#REF!`. Merged cells move whole: a selection that covers part of one takes in all of it, and a merged cell the block lands on is unmerged.
- A date cell type. Type `2026-03-04`, or a date written in your system's day/month order such as `04/03/2026`, and the cell holds a date: shown in that same order, right-aligned, and usable in arithmetic. A date plus 7 is a week later, and one date minus another is the number of days between them. Files that contain date cells cannot be opened by earlier versions of Slate.
- The fill handle continues series. Drag a single date and it counts on a day per cell, or back when filling up or left. Two or more numbers or dates with a constant step carry on that step, so 1 and 3 continue 5, 7, 9 and two dates a week apart continue weekly. A single number, or values with no steady step, still repeat as before.
- `DATE(year, month, day)`, `YEAR`, `MONTH` and `DAY` formula functions. `TODAY()` now returns a date rather than text.
- Chart labels are shown the way their cells are, so a date axis reads as dates and a price axis carries its currency.
- New rows extend calculated columns. When the two rows above a new row hold the same formula, relative to their rows, the new row gets it too, along with its formatting. This works for rows added with the add-row handle and rows inserted between others.
- Double-click the fill handle to fill the selection down to the bottom of the data beside it, or to the bottom of the table if there is none.
- Absolute references. `$A$1`, `A$1` and `$A1` anchor the column, the row, or both, so they stay fixed when a formula is filled or pasted elsewhere.

### Changed

- Decimal and percent numbers show at most two decimals, so `=AVERAGE` of three cells shows 0.67 rather than 0.6666666667, and a typed 3.14159 shows 3.14. The full number is kept and used in formulas, and the toolbar's decimal buttons show more or fewer digits.
- Formatting and lint rules now come from the shared `@larrydarko/lint-config` package.
- Filling or pasting a formula now shifts its references into other tables as well, so `=Sales::B2` filled down becomes `=Sales::B3`. Anchor the reference with `$` to keep it fixed.

### Fixed

- Adding up TRUE/FALSE values gives a number. `=SUM` over a column of checkboxes now shows how many are ticked, and `=AVERAGE` the share that are, where before both showed TRUE. `=TRUE+TRUE` is 2 and `=-TRUE` is -1. A checkbox that has never been ticked now counts as FALSE in formulas, the same as one that was ticked and unticked. A formula that only refers to a checkbox, such as `=B2`, or compares values, such as `=A1>5`, still shows TRUE or FALSE.
- Copying, pasting and filling cells keeps their type. Before, `$5` pasted as `5` and `50%` as `0.5`, and a number in a cell set to Text pasted as a number again. A formula cell given a type, such as a percentage, keeps it too.
- On macOS, opening a `.slate` file after closing Slate's last window now brings the window back with the file in it. Before, Slate stayed in the Dock without a window, and the file only appeared after clicking the Dock icon.
- On macOS, saving a file kept in Desktop, Documents or Downloads no longer fails with "Slate does not have permission to use that file", and no longer leaves a `.slate.tmp` file beside it. macOS can allow Slate to change the file you opened without allowing it into the rest of that folder. Slate could then create the safe-save temporary file but never use or remove it, so it stayed beside the file until moved to the Bin. Slate now checks the folder first and, when macOS refuses it, saves directly to the file without creating one. A crash in the middle of that save can leave the file incomplete, which the temporary file otherwise prevents. A `.slate.tmp` left behind by an earlier save holds that save's contents and can be deleted.
- Dates are read and shown in the day/month order of your system's region, not its language. On a Mac set to English (US) with a European region, `13/11/2026` was not recognised as a date and `12/11/2026` was read as 11 December. Dates entered that way before this fix are still held as the wrong day, and now show as such (11/12/2026), so they can be found and retyped.
- Choosing a type from the toolbar now applies it to every selected cell in one step, and one undo puts them all back. Before, only the active cell changed. Text that holds a number or date converts to it; other text, such as a header row in the selection, stays text, and empty cells are left alone.
- Recalculation no longer slows down exponentially as chains of dependent formulas get longer. A chain of 25 formulas used to freeze the app.
- Filling up or left from a multi-cell selection now continues the pattern backwards from the source. Before, the cell next to the source could repeat the source's own first value.
- Inserting or deleting a row or column now updates every formula and chart that points into the table. References past the change move with their cells, a range grows or shrinks to match, and a reference to a deleted cell becomes `#REF!`. Before, references kept their old coordinates and silently read different cells.
- Reordering or sorting rows and columns now updates references from other tables and from charts as well, so they keep pointing at the same cells.
- Filling or pasting a formula no longer rewrites a table name that looks like a cell reference: `Q1::A1` used to become `Q2::A1`. The same went for the end of a cross-table range and for names with underscores, such as `my_table1`.
- Shift-clicking cells no longer highlights the text of every column in between, and dragging a selection to move it no longer fails midway. Cells were open to the browser's own text selection, which ran across the table and turned the drag into a text drag.

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
