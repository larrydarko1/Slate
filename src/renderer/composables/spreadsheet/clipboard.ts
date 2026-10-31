/**
 * createClipboard — copy, cut, paste, and fill operations.
 * Owns: internal clipboard buffer, copyCells, cutCells, pasteCells, fillCells.
 * Does NOT own: cell access (useCells.ts), formula shifting (useFormulaEngine.ts).
 */
import { isNumericType, type CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { Cell, CellFormat, SelectionRange } from '@/renderer/types/spreadsheet';
import { generateId, createEmptyCell } from '@/renderer/types/spreadsheet';

export type SpreadsheetClipboard = {
    copyCells: (cut?: boolean) => Promise<void>;
    cutCells: () => Promise<void>;
    pasteCells: () => Promise<void>;
    fillCells: (tableId: string, source: SelectionRange, target: SelectionRange) => void;
};

type ClipboardDeps = {
    findTable: SpreadsheetHelpers['findTable'];
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    pushUndo: () => void;
    findCell: (tableId: string, col: number, row: number) => Cell | null;
    setCellValue: (tableId: string, col: number, row: number, raw: string) => void;
    getDisplayValue: (tableId: string, col: number, row: number) => string;
    getRawValue: (tableId: string, col: number, row: number) => string;
    setCellFormat: (tableId: string, col: number, row: number, fmt: Partial<CellFormat>) => void;
    shiftFormulaReferences: (formula: string, colDelta: number, rowDelta: number) => string;
    batchRecalculation: (run: () => void) => void;
};

type ClipboardCell = {
    raw: string;
    format?: CellFormat;
};

/** A run of numbers or dates rising by a constant step, the way a fill continues it. */
type Series = { start: number; step: number; type: CellDataType };

/**
 * The series `cells` form, if any: two or more plain numbers or dates of one
 * type with a constant step, or a single date, which counts on a day at a time.
 * Anything else, a single number included, is null and gets copied as it is.
 */
function findSeries(cells: (Cell | null)[]): Series | null {
    const type = cells[0]?.cellType;
    if (type === undefined || !isNumericType(type)) return null;
    const values: number[] = [];
    for (const cell of cells) {
        if (cell === null || cell.formula !== undefined || cell.cellType !== type || typeof cell.value !== 'number')
            return null;
        values.push(cell.value);
    }
    const [start = 0, second] = values;
    if (second === undefined) return type === 'date' ? { start, step: 1, type } : null;
    const step = second - start;
    const steady = values.every((value, i): boolean => Math.abs(value - (start + step * i)) < 1e-9);
    return steady ? { start, step, type } : null;
}

/** `n` mod `size`, kept non-negative for an `n` below zero. */
function wrap(n: number, size: number): number {
    return ((n % size) + size) % size;
}

export function createClipboard(state: SpreadsheetCoreState, deps: ClipboardDeps): SpreadsheetClipboard {
    let clipboardData: ClipboardCell[][] | null = null;
    let clipboardIsCut = false;
    let clipboardSource: SelectionRange | null = null;

    async function copyCells(cut = false): Promise<void> {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;

        const rows: ClipboardCell[][] = [];
        const tsvRows: string[] = [];

        for (let rowIdx = sr.startRow; rowIdx <= sr.endRow; rowIdx++) {
            const rowCells: ClipboardCell[] = [];
            const tsvCols: string[] = [];
            for (let colIdx = sr.startCol; colIdx <= sr.endCol; colIdx++) {
                const raw = deps.getRawValue(sr.tableId, colIdx, rowIdx);
                const cell = deps.findCell(sr.tableId, colIdx, rowIdx);
                const copied: ClipboardCell = { raw };
                // Set only when there is one: an absent format and a `format` key
                // holding `undefined` are different things to the paste side.
                if (cell?.format !== undefined) copied.format = { ...cell.format };
                rowCells.push(copied);
                tsvCols.push(deps.getDisplayValue(sr.tableId, colIdx, rowIdx));
            }
            rows.push(rowCells);
            tsvRows.push(tsvCols.join('\t'));
        }

        clipboardData = rows;
        clipboardIsCut = cut;
        clipboardSource = { ...sr };

        try {
            await navigator.clipboard.writeText(tsvRows.join('\n'));
        } catch {
            /* ignore – internal clipboard still works */
        }
    }

    async function cutCells(): Promise<void> {
        await copyCells(true);
    }

    async function pasteCells(): Promise<void> {
        if (state.activeCell.value === null) return;
        deps.pushUndo();
        const { tableId, col: startCol, row: startRow } = state.activeCell.value;
        const table = deps.findTable(tableId);
        if (table === null) return;

        let data = clipboardData;

        if (data === null) {
            try {
                const text = await navigator.clipboard.readText();
                if (text !== '') {
                    data = text
                        .split('\n')
                        .map((line): { raw: string }[] => line.split('\t').map((v): { raw: string } => ({ raw: v })));
                }
            } catch {
                /* clipboard read blocked */
            }
        }

        if (data === null || data.length === 0) return;

        // Expand table if necessary
        const neededRows = startRow + data.length;
        const neededCols = startCol + Math.max(...data.map((r): number => r.length));
        while (table.rows.length < neededRows) {
            table.rows.push(table.columns.map((): Cell => createEmptyCell()));
        }
        while (table.columns.length < neededCols) {
            table.columns.push({ id: generateId('col'), width: 120 });
            for (const row of table.rows) row.push(createEmptyCell());
        }

        const srcStartCol = clipboardSource?.startCol ?? 0;
        const srcStartRow = clipboardSource?.startRow ?? 0;

        // A formula pasted somewhere other than where it was copied has to have
        // its relative references moved by the same offset as the cell itself.
        function shiftIfMoved(raw: string, colIdx: number, rowIdx: number): string {
            if (!raw.startsWith('=') || clipboardSource === null) return raw;
            const colDelta = startCol + colIdx - (srcStartCol + colIdx);
            const rowDelta = startRow + rowIdx - (srcStartRow + rowIdx);
            if (colDelta === 0 && rowDelta === 0) return raw;
            return `=${deps.shiftFormulaReferences(raw.substring(1), colDelta, rowDelta)}`;
        }

        deps.batchRecalculation((): void => {
            for (const [rowIdx, dataRow] of data.entries()) {
                for (const [colIdx, entry] of dataRow.entries()) {
                    deps.setCellValue(
                        tableId,
                        startCol + colIdx,
                        startRow + rowIdx,
                        shiftIfMoved(entry.raw, colIdx, rowIdx),
                    );
                    if (entry.format !== undefined) {
                        deps.setCellFormat(tableId, startCol + colIdx, startRow + rowIdx, entry.format);
                    }
                }
            }

            if (clipboardIsCut && clipboardSource !== null) {
                const src = clipboardSource;
                // Clearing the source of a cut, except where it overlaps the paste
                // target — those cells were just written.
                function clearCutRow(rowIdx: number): void {
                    for (let colIdx = src.startCol; colIdx <= src.endCol; colIdx++) {
                        const destRow = startRow + (rowIdx - src.startRow);
                        const destCol = startCol + (colIdx - src.startCol);
                        if (src.tableId === tableId && colIdx === destCol && rowIdx === destRow) continue;
                        deps.setCellValue(src.tableId, colIdx, rowIdx, '');
                    }
                }
                for (let rowIdx = src.startRow; rowIdx <= src.endRow; rowIdx++) clearCutRow(rowIdx);
                clipboardIsCut = false;
                clipboardSource = null;
            }
        });

        state.selectionRange.value = {
            tableId,
            startCol,
            startRow,
            endCol: startCol + Math.max(...data.map((r): number => r.length)) - 1,
            endRow: startRow + data.length - 1,
        };
    }

    function fillCells(tableId: string, source: SelectionRange, target: SelectionRange): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        deps.pushUndo();

        const srcRows = source.endRow - source.startRow + 1;
        const srcCols = source.endCol - source.startCol + 1;

        const neededRows = target.endRow + 1;
        const neededCols = target.endCol + 1;
        while (table.rows.length < neededRows) {
            table.rows.push(table.columns.map((): Cell => createEmptyCell()));
        }
        while (table.columns.length < neededCols) {
            table.columns.push({ id: generateId('col'), width: 120 });
            for (const row of table.rows) row.push(createEmptyCell());
        }

        // A fill runs down or up when it adds rows, across otherwise. Each source
        // column (or row) along that direction may be a series to continue.
        const vertical = target.startRow !== source.startRow || target.endRow !== source.endRow;
        const seriesByLine = new Map<number, Series>();
        const [lineStart, lineEnd] = vertical ? [source.startCol, source.endCol] : [source.startRow, source.endRow];
        const [stepStart, stepEnd] = vertical ? [source.startRow, source.endRow] : [source.startCol, source.endCol];
        for (let line = lineStart; line <= lineEnd; line++) {
            const cells: (Cell | null)[] = [];
            for (let step = stepStart; step <= stepEnd; step++) {
                cells.push(vertical ? deps.findCell(tableId, line, step) : deps.findCell(tableId, step, line));
            }
            const series = findSeries(cells);
            if (series !== null) seriesByLine.set(line, series);
        }

        function fillCell(colIdx: number, rowIdx: number): void {
            // Counted from the source, not the target, so a fill up or left
            // runs the pattern backwards from the cell next to the source.
            const srcR = source.startRow + wrap(rowIdx - source.startRow, srcRows);
            const srcC = source.startCol + wrap(colIdx - source.startCol, srcCols);
            const srcCell = deps.findCell(tableId, srcC, srcR);
            if (srcCell === null) return;

            const series = seriesByLine.get(vertical ? colIdx : rowIdx);
            const cell = table?.rows[rowIdx]?.[colIdx];
            if (series !== undefined && cell !== undefined) {
                const offset = vertical ? rowIdx - source.startRow : colIdx - source.startCol;
                // Clears whatever the cell held, then takes the next value as it is,
                // rather than as text to detect a type from again.
                deps.setCellValue(tableId, colIdx, rowIdx, '');
                cell.value = parseFloat((series.start + series.step * offset).toFixed(10));
                cell.cellType = series.type;
            } else if (srcCell.formula !== undefined) {
                const shifted = deps.shiftFormulaReferences(srcCell.formula, colIdx - srcC, rowIdx - srcR);
                deps.setCellValue(tableId, colIdx, rowIdx, `=${shifted}`);
            } else {
                deps.setCellValue(tableId, colIdx, rowIdx, deps.getRawValue(tableId, srcC, srcR));
            }
            if (srcCell.format !== undefined) {
                deps.setCellFormat(tableId, colIdx, rowIdx, { ...srcCell.format });
            }
        }

        const inSource = (colIdx: number, rowIdx: number): boolean =>
            rowIdx >= source.startRow &&
            rowIdx <= source.endRow &&
            colIdx >= source.startCol &&
            colIdx <= source.endCol;
        deps.batchRecalculation((): void => {
            for (let rowIdx = target.startRow; rowIdx <= target.endRow; rowIdx++) {
                for (let colIdx = target.startCol; colIdx <= target.endCol; colIdx++) {
                    if (!inSource(colIdx, rowIdx)) fillCell(colIdx, rowIdx);
                }
            }
        });
    }

    return { copyCells, cutCells, pasteCells, fillCells };
}
