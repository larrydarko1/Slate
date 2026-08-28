/**
 * createClipboard — copy, cut, paste, and fill operations.
 * Owns: internal clipboard buffer, copyCells, cutCells, pasteCells, fillCells.
 * Does NOT own: cell access (useCells.ts), formula shifting (useFormulaEngine.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
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
    recalculate: () => void;
};

type ClipboardCell = {
    raw: string;
    format?: CellFormat;
};

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
                rowCells.push({
                    raw,
                    format: cell?.format !== undefined ? { ...cell.format } : undefined,
                });
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
            return '=' + deps.shiftFormulaReferences(raw.substring(1), colDelta, rowDelta);
        }

        for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
            for (let colIdx = 0; colIdx < data[rowIdx].length; colIdx++) {
                const entry = data[rowIdx][colIdx];
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

        state.selectionRange.value = {
            tableId,
            startCol,
            startRow,
            endCol: startCol + Math.max(...data.map((r): number => r.length)) - 1,
            endRow: startRow + data.length - 1,
        };

        deps.recalculate();
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

        for (let rowIdx = target.startRow; rowIdx <= target.endRow; rowIdx++) {
            for (let colIdx = target.startCol; colIdx <= target.endCol; colIdx++) {
                if (
                    rowIdx >= source.startRow &&
                    rowIdx <= source.endRow &&
                    colIdx >= source.startCol &&
                    colIdx <= source.endCol
                )
                    continue;
                const srcR = source.startRow + ((rowIdx - target.startRow) % srcRows);
                const srcC = source.startCol + ((colIdx - target.startCol) % srcCols);
                const srcCell = deps.findCell(tableId, srcC, srcR);
                if (srcCell === null) continue;

                const colDelta = colIdx - srcC;
                const rowDelta = rowIdx - srcR;

                if (srcCell.formula !== undefined) {
                    const shifted = deps.shiftFormulaReferences(srcCell.formula, colDelta, rowDelta);
                    deps.setCellValue(tableId, colIdx, rowIdx, '=' + shifted);
                } else {
                    const raw = deps.getRawValue(tableId, srcC, srcR);
                    deps.setCellValue(tableId, colIdx, rowIdx, raw);
                }
                if (srcCell.format !== undefined) {
                    deps.setCellFormat(tableId, colIdx, rowIdx, { ...srcCell.format });
                }
            }
        }
        deps.recalculate();
    }

    return { copyCells, cutCells, pasteCells, fillCells };
}
