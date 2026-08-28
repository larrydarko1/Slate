/**
 * createTableReorder — row and column reorder operations.
 * Owns: reorderRow, reorderRows, reorderColumn, reorderColumns.
 * Does NOT own: CRUD (useTables.ts), sorting (useTableSort.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SpreadsheetTable } from '@/renderer/types/spreadsheet';

export type TableReorder = {
    reorderRow: (tableId: string, fromIdx: number, toIdx: number) => void;
    reorderRows: (tableId: string, fromStart: number, fromEnd: number, toIdx: number) => void;
    reorderColumn: (tableId: string, fromIdx: number, toIdx: number) => void;
    reorderColumns: (tableId: string, fromStart: number, fromEnd: number, toIdx: number) => void;
};

type ReorderDeps = {
    findTable: SpreadsheetHelpers['findTable'];
    pushUndo: () => void;
    recalculate: () => void;
    remapAllFormulasInTable: (
        t: SpreadsheetTable,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) => void;
    remapRowIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
    remapColIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
};

export function createTableReorder(state: SpreadsheetCoreState, deps: ReorderDeps): TableReorder {
    function reorderRow(tableId: string, fromIdx: number, toIdx: number): void {
        reorderRows(tableId, fromIdx, fromIdx, toIdx);
    }

    function reorderRows(tableId: string, fromStart: number, fromEnd: number, toIdx: number): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        const count = fromEnd - fromStart + 1;
        if (toIdx >= fromStart && toIdx <= fromEnd) return;
        if (fromStart < 0 || fromEnd >= table.rows.length) return;
        if (toIdx < 0 || toIdx >= table.rows.length) return;
        deps.pushUndo();

        const movedRows = table.rows.splice(fromStart, count);
        const insertAt = toIdx > fromStart ? toIdx - count + 1 : toIdx;
        table.rows.splice(insertAt, 0, ...movedRows);

        table.mergedRegions = table.mergedRegions.map(
            (m): { startRow: number; endRow: number; startCol: number; endCol: number } => {
                let sr = deps.remapRowIdx(m.startRow, fromStart, fromEnd, insertAt);
                let er = deps.remapRowIdx(m.endRow, fromStart, fromEnd, insertAt);
                if (sr > er) {
                    const tmp = sr;
                    sr = er;
                    er = tmp;
                }
                return { ...m, startRow: sr, endRow: er };
            },
        );

        if (state.activeCell.value?.tableId === tableId) {
            state.activeCell.value.row = deps.remapRowIdx(state.activeCell.value.row, fromStart, fromEnd, insertAt);
        }
        if (state.selectionRange.value?.tableId === tableId) {
            const sr = state.selectionRange.value;
            sr.startRow = insertAt;
            sr.endRow = insertAt + count - 1;
        }

        const rowMapper = (idx: number): number => deps.remapRowIdx(idx, fromStart, fromEnd, insertAt);
        deps.remapAllFormulasInTable(table, null, rowMapper);
        deps.recalculate();
    }

    function reorderColumn(tableId: string, fromIdx: number, toIdx: number): void {
        reorderColumns(tableId, fromIdx, fromIdx, toIdx);
    }

    function reorderColumns(tableId: string, fromStart: number, fromEnd: number, toIdx: number): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        const count = fromEnd - fromStart + 1;
        if (toIdx >= fromStart && toIdx <= fromEnd) return;
        if (fromStart < 0 || fromEnd >= table.columns.length) return;
        if (toIdx < 0 || toIdx >= table.columns.length) return;
        deps.pushUndo();

        const movedCols = table.columns.splice(fromStart, count);
        const insertAt = toIdx > fromStart ? toIdx - count + 1 : toIdx;
        table.columns.splice(insertAt, 0, ...movedCols);

        for (const row of table.rows) {
            const movedCells = row.splice(fromStart, count);
            row.splice(insertAt, 0, ...movedCells);
        }

        table.mergedRegions = table.mergedRegions.map(
            (m): { startCol: number; endCol: number; startRow: number; endRow: number } => {
                let sc = deps.remapColIdx(m.startCol, fromStart, fromEnd, insertAt);
                let ec = deps.remapColIdx(m.endCol, fromStart, fromEnd, insertAt);
                if (sc > ec) {
                    const tmp = sc;
                    sc = ec;
                    ec = tmp;
                }
                return { ...m, startCol: sc, endCol: ec };
            },
        );

        if (state.activeCell.value?.tableId === tableId) {
            state.activeCell.value.col = deps.remapColIdx(state.activeCell.value.col, fromStart, fromEnd, insertAt);
        }
        if (state.selectionRange.value?.tableId === tableId) {
            const sr = state.selectionRange.value;
            sr.startCol = insertAt;
            sr.endCol = insertAt + count - 1;
        }

        const colMapper = (idx: number): number => deps.remapColIdx(idx, fromStart, fromEnd, insertAt);
        deps.remapAllFormulasInTable(table, colMapper, null);
        deps.recalculate();
    }

    return { reorderRow, reorderRows, reorderColumn, reorderColumns };
}
