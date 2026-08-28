/**
 * useSelection — cell, row, column, and range selection with keyboard navigation.
 * Owns: selectCell, selectRow/Col, extend selection, moveSelection.
 * Does NOT own: editing (useEditing.ts), helpers (helpers.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { SelectionRange } from '@/renderer/types/spreadsheet';

export type SpreadsheetSelection = {
    selectCell: (tableId: string, col: number, row: number) => void;
    selectRow: (tableId: string, row: number) => void;
    selectColumn: (tableId: string, col: number) => void;
    selectAll: (tableId: string) => void;
    extendSelection: (tableId: string, col: number, row: number) => void;
    extendRowSelection: (tableId: string, row: number) => void;
    extendColumnSelection: (tableId: string, col: number) => void;
    moveSelection: (dCol: number, dRow: number) => void;
};

type SelectionDeps = {
    findTable: SpreadsheetHelpers['findTable'];
    bringToFront: SpreadsheetHelpers['bringToFront'];
    commitEdit: () => void;
};

export function createSelection(state: SpreadsheetCoreState, deps: SelectionDeps): SpreadsheetSelection {
    function selectCell(tableId: string, col: number, row: number): void {
        if (state.isEditing.value) deps.commitEdit();
        state.activeCell.value = { tableId, col, row };
        state.activeTextBoxId.value = null;
        state.activeChartId.value = null;
        state.selectionRange.value = { tableId, startCol: col, startRow: row, endCol: col, endRow: row };
        deps.bringToFront(tableId);
    }

    function selectRow(tableId: string, row: number): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        if (state.isEditing.value) deps.commitEdit();
        state.activeCell.value = { tableId, col: 0, row };
        state.activeTextBoxId.value = null;
        state.activeChartId.value = null;
        state.selectionRange.value = {
            tableId,
            startCol: 0,
            startRow: row,
            endCol: table.columns.length - 1,
            endRow: row,
        };
        deps.bringToFront(tableId);
    }

    function selectColumn(tableId: string, col: number): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        if (state.isEditing.value) deps.commitEdit();
        state.activeCell.value = { tableId, col, row: 0 };
        state.activeTextBoxId.value = null;
        state.activeChartId.value = null;
        state.selectionRange.value = {
            tableId,
            startCol: col,
            startRow: 0,
            endCol: col,
            endRow: table.rows.length - 1,
        };
        deps.bringToFront(tableId);
    }

    function selectAll(tableId: string): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        if (state.isEditing.value) deps.commitEdit();
        state.activeCell.value = { tableId, col: 0, row: 0 };
        state.selectionRange.value = {
            tableId,
            startCol: 0,
            startRow: 0,
            endCol: table.columns.length - 1,
            endRow: table.rows.length - 1,
        };
        deps.bringToFront(tableId);
    }

    function extendSelection(tableId: string, col: number, row: number): void {
        if (state.activeCell.value === null || state.activeCell.value.tableId !== tableId) return;
        if (state.isEditing.value) deps.commitEdit();
        const sr = state.selectionRange.value ?? anchorRange(state.activeCell.value);
        state.selectionRange.value = {
            tableId,
            startCol: sr.startCol,
            startRow: sr.startRow,
            endCol: col,
            endRow: row,
        };
    }

    function extendRowSelection(tableId: string, row: number): void {
        if (state.activeCell.value === null || state.activeCell.value.tableId !== tableId) return;
        const table = deps.findTable(tableId);
        if (table === null) return;
        if (state.isEditing.value) deps.commitEdit();
        const sr = state.selectionRange.value ?? anchorRange(state.activeCell.value);
        state.selectionRange.value = {
            tableId,
            startCol: 0,
            startRow: sr.startRow,
            endCol: table.columns.length - 1,
            endRow: row,
        };
    }

    function extendColumnSelection(tableId: string, col: number): void {
        if (state.activeCell.value === null || state.activeCell.value.tableId !== tableId) return;
        const table = deps.findTable(tableId);
        if (table === null) return;
        if (state.isEditing.value) deps.commitEdit();
        const sr = state.selectionRange.value ?? anchorRange(state.activeCell.value);
        state.selectionRange.value = {
            tableId,
            startCol: sr.startCol,
            startRow: 0,
            endCol: col,
            endRow: table.rows.length - 1,
        };
    }

    function moveSelection(dCol: number, dRow: number): void {
        if (state.activeCell.value === null) return;
        const table = deps.findTable(state.activeCell.value.tableId);
        if (table === null) return;
        const newCol = Math.max(0, Math.min(table.columns.length - 1, state.activeCell.value.col + dCol));
        const newRow = Math.max(0, Math.min(table.rows.length - 1, state.activeCell.value.row + dRow));
        state.activeCell.value = { tableId: state.activeCell.value.tableId, col: newCol, row: newRow };
    }

    return {
        selectCell,
        selectRow,
        selectColumn,
        selectAll,
        extendSelection,
        extendRowSelection,
        extendColumnSelection,
        moveSelection,
    };
}

/**
 * The one-cell range an extend gesture starts from when nothing is selected yet.
 * `activeCell` is always set by the time an extend runs — the callers check it —
 * so this only covers the window between clicking a cell and the range being
 * written.
 */
function anchorRange(anchor: { tableId: string; col: number; row: number }): SelectionRange {
    return {
        tableId: anchor.tableId,
        startCol: anchor.col,
        startRow: anchor.row,
        endCol: anchor.col,
        endRow: anchor.row,
    };
}
