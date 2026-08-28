/**
 * createTables — table CRUD, row/column operations, and bulk selection operations.
 * Owns: addTable, removeTable, renameTable, moveTable, row/col add/delete/insert, bulk delete.
 * Does NOT own: reordering (useTableReorder.ts), sorting (useTableSort.ts), cell access (useCells.ts).
 */
import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetHelpers } from '@/renderer/composables/spreadsheet/helpers';
import type { Cell, SpreadsheetTable, MergedRegion } from '@/renderer/types/spreadsheet';
import { generateId, createEmptyCell, createDefaultTable } from '@/renderer/types/spreadsheet';
import { createTableReorder } from '@/renderer/composables/spreadsheet/tableReorder';
import { createTableSort } from '@/renderer/composables/spreadsheet/tableSort';

export type SpreadsheetTables = {
    addTable: () => void;
    removeTable: (tableId: string) => void;
    renameTable: (tableId: string, name: string) => void;
    moveTable: (tableId: string, x: number, y: number) => void;
    addRow: (tableId: string) => void;
    addColumn: (tableId: string) => void;
    isRowEmpty: (tableId: string, rowIdx: number) => boolean;
    isColumnEmpty: (tableId: string, colIdx: number) => boolean;
    removeLastRowIfEmpty: (tableId: string) => boolean;
    removeLastColumnIfEmpty: (tableId: string) => boolean;
    deleteRow: (tableId: string, rowIdx: number) => void;
    deleteColumn: (tableId: string, colIdx: number) => void;
    insertRowAt: (tableId: string, rowIdx: number) => void;
    insertColumnAt: (tableId: string, colIdx: number) => void;
    reorderRow: (tableId: string, fromIdx: number, toIdx: number) => void;
    reorderRows: (tableId: string, fromStart: number, fromEnd: number, toIdx: number) => void;
    reorderColumn: (tableId: string, fromIdx: number, toIdx: number) => void;
    reorderColumns: (tableId: string, fromStart: number, fromEnd: number, toIdx: number) => void;
    sortColumn: (tableId: string, colIdx: number, direction: 'asc' | 'desc') => void;
    deleteSelectedRows: () => void;
    deleteSelectedColumns: () => void;
};

type TablesDeps = {
    findTable: SpreadsheetHelpers['findTable'];
    findNormalizedSelection: SpreadsheetHelpers['findNormalizedSelection'];
    pushUndo: () => void;
    startUndoBatch: () => void;
    recalculate: () => void;
    remapAllFormulasInTable: (
        t: SpreadsheetTable,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) => void;
    remapRowIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
    remapColIdx: (idx: number, fromStart: number, fromEnd: number, insertAt: number) => number;
    rewriteTableNameReferences: (oldName: string, newName: string) => void;
};

export function createTables(state: SpreadsheetCoreState, deps: TablesDeps): SpreadsheetTables {
    function addTable(): void {
        deps.pushUndo();
        state.counters.tableCount++;
        const offsetIdx = state.activeCanvas.value.tables.length;
        const zoom = state.canvasZoom.value;
        const posX = (-state.canvasOffset.value.x + 80 + offsetIdx * 40) / zoom;
        const posY = (-state.canvasOffset.value.y + 60 + offsetIdx * 40) / zoom;
        const table = createDefaultTable(posX, posY, `Table ${state.counters.tableCount}`);
        table.zIndex = ++state.counters.maxZ;
        state.activeCanvas.value.tables.push(table);
    }

    function removeTable(tableId: string): void {
        deps.pushUndo();
        const canvas = state.activeCanvas.value;
        canvas.tables = canvas.tables.filter((t): boolean => t.id !== tableId);
        if (state.activeCell.value?.tableId === tableId) state.activeCell.value = null;
    }

    function renameTable(tableId: string, name: string): void {
        deps.pushUndo();
        const table = deps.findTable(tableId);
        if (table === null) return;
        const oldName = table.name;
        if (oldName === name) return;
        table.name = name;
        deps.rewriteTableNameReferences(oldName, name);
        deps.recalculate();
    }

    function moveTable(tableId: string, x: number, y: number): void {
        deps.startUndoBatch();
        const table = deps.findTable(tableId);
        if (table !== null) {
            table.x = x;
            table.y = y;
        }
    }

    // ── Row / Column operations ──────────────────────────────────────────────

    function addRow(tableId: string): void {
        deps.pushUndo();
        const table = deps.findTable(tableId);
        if (table === null) return;
        table.rows.push(table.columns.map((): Cell => createEmptyCell()));
    }

    function addColumn(tableId: string): void {
        deps.pushUndo();
        const table = deps.findTable(tableId);
        if (table === null) return;
        table.columns.push({ id: generateId('col'), width: 120 });
        for (const row of table.rows) row.push(createEmptyCell());
    }

    function isRowEmpty(tableId: string, rowIdx: number): boolean {
        const table = deps.findTable(tableId);
        if (table === null || rowIdx < 0 || rowIdx >= table.rows.length) return false;
        return table.rows[rowIdx].every((cell): boolean => cell.value === null && cell.formula === undefined);
    }

    function isColumnEmpty(tableId: string, colIdx: number): boolean {
        const table = deps.findTable(tableId);
        if (table === null || colIdx < 0 || colIdx >= table.columns.length) return false;
        return table.rows.every((row): boolean => {
            const cell = row[colIdx];
            return cell.value === null && cell.formula === undefined;
        });
    }

    function removeLastRowIfEmpty(tableId: string): boolean {
        const table = deps.findTable(tableId);
        if (table === null || table.rows.length <= 1) return false;
        const lastIdx = table.rows.length - 1;
        if (!isRowEmpty(tableId, lastIdx)) return false;
        const hasMerge = table.mergedRegions.some((m): boolean => lastIdx >= m.startRow && lastIdx <= m.endRow);
        if (hasMerge) return false;
        table.rows.splice(lastIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.row >= table.rows.length) {
            state.activeCell.value.row = table.rows.length - 1;
        }
        return true;
    }

    function removeLastColumnIfEmpty(tableId: string): boolean {
        const table = deps.findTable(tableId);
        if (table === null || table.columns.length <= 1) return false;
        const lastIdx = table.columns.length - 1;
        if (!isColumnEmpty(tableId, lastIdx)) return false;
        const hasMerge = table.mergedRegions.some((m): boolean => lastIdx >= m.startCol && lastIdx <= m.endCol);
        if (hasMerge) return false;
        table.columns.splice(lastIdx, 1);
        for (const row of table.rows) row.splice(lastIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.col >= table.columns.length) {
            state.activeCell.value.col = table.columns.length - 1;
        }
        return true;
    }

    function deleteRow(tableId: string, rowIdx: number): void {
        const table = deps.findTable(tableId);
        if (table === null || table.rows.length <= 1) return;
        deps.pushUndo();
        table.mergedRegions = table.mergedRegions
            .map((m): MergedRegion | null => {
                if (rowIdx < m.startRow) return { ...m, startRow: m.startRow - 1, endRow: m.endRow - 1 };
                if (rowIdx > m.endRow) return m;
                if (m.startRow === m.endRow) return null;
                return { ...m, endRow: m.endRow - 1 };
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol));
        table.rows.splice(rowIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.row >= table.rows.length) {
            state.activeCell.value.row = table.rows.length - 1;
        }
        deps.recalculate();
    }

    function deleteColumn(tableId: string, colIdx: number): void {
        const table = deps.findTable(tableId);
        if (table === null || table.columns.length <= 1) return;
        deps.pushUndo();
        table.mergedRegions = table.mergedRegions
            .map((m): MergedRegion | null => {
                if (colIdx < m.startCol) return { ...m, startCol: m.startCol - 1, endCol: m.endCol - 1 };
                if (colIdx > m.endCol) return m;
                if (m.startCol === m.endCol) return null;
                return { ...m, endCol: m.endCol - 1 };
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol));
        table.columns.splice(colIdx, 1);
        for (const row of table.rows) row.splice(colIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.col >= table.columns.length) {
            state.activeCell.value.col = table.columns.length - 1;
        }
        deps.recalculate();
    }

    function insertRowAt(tableId: string, rowIdx: number): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        deps.pushUndo();
        table.mergedRegions = table.mergedRegions.map((m): MergedRegion => {
            if (rowIdx <= m.startRow) return { ...m, startRow: m.startRow + 1, endRow: m.endRow + 1 };
            if (rowIdx <= m.endRow) return { ...m, endRow: m.endRow + 1 };
            return m;
        });
        table.rows.splice(
            rowIdx,
            0,
            table.columns.map((): Cell => createEmptyCell()),
        );
        deps.recalculate();
    }

    function insertColumnAt(tableId: string, colIdx: number): void {
        const table = deps.findTable(tableId);
        if (table === null) return;
        deps.pushUndo();
        table.mergedRegions = table.mergedRegions.map((m): MergedRegion => {
            if (colIdx <= m.startCol) return { ...m, startCol: m.startCol + 1, endCol: m.endCol + 1 };
            if (colIdx <= m.endCol) return { ...m, endCol: m.endCol + 1 };
            return m;
        });
        table.columns.splice(colIdx, 0, { id: generateId('col'), width: 120 });
        for (const row of table.rows) row.splice(colIdx, 0, createEmptyCell());
        deps.recalculate();
    }

    // ── Delegated modules ────────────────────────────────────────────────────

    const { reorderRow, reorderRows, reorderColumn, reorderColumns } = createTableReorder(state, {
        findTable: deps.findTable,
        pushUndo: deps.pushUndo,
        recalculate: deps.recalculate,
        remapAllFormulasInTable: deps.remapAllFormulasInTable,
        remapRowIdx: deps.remapRowIdx,
        remapColIdx: deps.remapColIdx,
    });

    const { sortColumn } = createTableSort({
        findTable: deps.findTable,
        pushUndo: deps.pushUndo,
        recalculate: deps.recalculate,
        remapAllFormulasInTable: deps.remapAllFormulasInTable,
    });

    // ── Bulk selection operations ────────────────────────────────────────────

    function deleteSelectedRows(): void {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        const table = deps.findTable(sr.tableId);
        if (table === null) return;
        if (sr.startCol !== 0 || sr.endCol !== table.columns.length - 1) return;
        const count = sr.endRow - sr.startRow + 1;
        if (count >= table.rows.length) return;
        deps.pushUndo();
        for (let rowIdx = sr.endRow; rowIdx >= sr.startRow; rowIdx--) {
            deleteRow(sr.tableId, rowIdx);
        }
        if (state.activeCell.value !== null && state.activeCell.value.tableId === sr.tableId) {
            state.activeCell.value.row = Math.min(sr.startRow, table.rows.length - 1);
            state.activeCell.value.col = 0;
        }
        state.selectionRange.value = null;
    }

    function deleteSelectedColumns(): void {
        const sr = deps.findNormalizedSelection();
        if (sr === null) return;
        const table = deps.findTable(sr.tableId);
        if (table === null) return;
        if (sr.startRow !== 0 || sr.endRow !== table.rows.length - 1) return;
        const count = sr.endCol - sr.startCol + 1;
        if (count >= table.columns.length) return;
        deps.pushUndo();
        for (let colIdx = sr.endCol; colIdx >= sr.startCol; colIdx--) {
            deleteColumn(sr.tableId, colIdx);
        }
        if (state.activeCell.value !== null && state.activeCell.value.tableId === sr.tableId) {
            state.activeCell.value.col = Math.min(sr.startCol, table.columns.length - 1);
            state.activeCell.value.row = 0;
        }
        state.selectionRange.value = null;
    }

    return {
        addTable,
        removeTable,
        renameTable,
        moveTable,
        addRow,
        addColumn,
        isRowEmpty,
        isColumnEmpty,
        removeLastRowIfEmpty,
        removeLastColumnIfEmpty,
        deleteRow,
        deleteColumn,
        insertRowAt,
        insertColumnAt,
        reorderRow,
        reorderRows,
        reorderColumn,
        reorderColumns,
        sortColumn,
        deleteSelectedRows,
        deleteSelectedColumns,
    };
}
