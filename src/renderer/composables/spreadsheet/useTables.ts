// useTables — table CRUD, row/column operations, and bulk selection operations.
// Owns: addTable, removeTable, renameTable, moveTable, row/col add/delete/insert, bulk delete.
// Does NOT own: reordering (useTableReorder.ts), sorting (useTableSort.ts), cell access (useCells.ts).

import type { SpreadsheetCoreState } from './state';
import type { SpreadsheetHelpers } from './helpers';
import type { SpreadsheetTable, MergedRegion } from '../../types/spreadsheet';
import { generateId, createEmptyCell, createDefaultTable } from '../../types/spreadsheet';
import { createTableReorder } from './useTableReorder';
import { createTableSort } from './useTableSort';

interface TablesDeps {
    findTable: SpreadsheetHelpers['findTable'];
    getNormalizedSelection: SpreadsheetHelpers['getNormalizedSelection'];
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
}

export function createTables(state: SpreadsheetCoreState, deps: TablesDeps) {
    // ── CRUD ─────────────────────────────────────────────────────────────────

    function addTable(): void {
        deps.pushUndo();
        state.counters.tableCount++;
        const offsetIdx = state.activeCanvas.value.tables.length;
        const zoom = state.canvasZoom.value;
        const x = (-state.canvasOffset.value.x + 80 + offsetIdx * 40) / zoom;
        const y = (-state.canvasOffset.value.y + 60 + offsetIdx * 40) / zoom;
        const t = createDefaultTable(x, y, `Table ${state.counters.tableCount}`);
        t.zIndex = ++state.counters.maxZ;
        state.activeCanvas.value.tables.push(t);
    }

    function removeTable(tableId: string): void {
        deps.pushUndo();
        const canvas = state.activeCanvas.value;
        canvas.tables = canvas.tables.filter((t) => t.id !== tableId);
        if (state.activeCell.value?.tableId === tableId) state.activeCell.value = null;
    }

    function renameTable(tableId: string, name: string): void {
        deps.pushUndo();
        const t = deps.findTable(tableId);
        if (!t) return;
        const oldName = t.name;
        if (oldName === name) return;
        t.name = name;
        deps.rewriteTableNameReferences(oldName, name);
        deps.recalculate();
    }

    function moveTable(tableId: string, x: number, y: number): void {
        deps.startUndoBatch();
        const t = deps.findTable(tableId);
        if (t) {
            t.x = x;
            t.y = y;
        }
    }

    // ── Row / Column operations ──────────────────────────────────────────────

    function addRow(tableId: string): void {
        deps.pushUndo();
        const t = deps.findTable(tableId);
        if (!t) return;
        t.rows.push(t.columns.map(() => createEmptyCell()));
    }

    function addColumn(tableId: string): void {
        deps.pushUndo();
        const t = deps.findTable(tableId);
        if (!t) return;
        t.columns.push({ id: generateId('col'), width: 120 });
        for (const row of t.rows) row.push(createEmptyCell());
    }

    function isRowEmpty(tableId: string, rowIdx: number): boolean {
        const t = deps.findTable(tableId);
        if (!t || rowIdx < 0 || rowIdx >= t.rows.length) return false;
        return t.rows[rowIdx].every((cell) => cell.value === null && !cell.formula);
    }

    function isColumnEmpty(tableId: string, colIdx: number): boolean {
        const t = deps.findTable(tableId);
        if (!t || colIdx < 0 || colIdx >= t.columns.length) return false;
        return t.rows.every((row) => {
            const cell = row[colIdx];
            return cell.value === null && !cell.formula;
        });
    }

    function removeLastRowIfEmpty(tableId: string): boolean {
        const t = deps.findTable(tableId);
        if (!t || t.rows.length <= 1) return false;
        const lastIdx = t.rows.length - 1;
        if (!isRowEmpty(tableId, lastIdx)) return false;
        const hasMerge = t.mergedRegions.some((m) => lastIdx >= m.startRow && lastIdx <= m.endRow);
        if (hasMerge) return false;
        t.rows.splice(lastIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.row >= t.rows.length) {
            state.activeCell.value.row = t.rows.length - 1;
        }
        return true;
    }

    function removeLastColumnIfEmpty(tableId: string): boolean {
        const t = deps.findTable(tableId);
        if (!t || t.columns.length <= 1) return false;
        const lastIdx = t.columns.length - 1;
        if (!isColumnEmpty(tableId, lastIdx)) return false;
        const hasMerge = t.mergedRegions.some((m) => lastIdx >= m.startCol && lastIdx <= m.endCol);
        if (hasMerge) return false;
        t.columns.splice(lastIdx, 1);
        for (const row of t.rows) row.splice(lastIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.col >= t.columns.length) {
            state.activeCell.value.col = t.columns.length - 1;
        }
        return true;
    }

    function deleteRow(tableId: string, rowIdx: number): void {
        const t = deps.findTable(tableId);
        if (!t || t.rows.length <= 1) return;
        deps.pushUndo();
        t.mergedRegions = t.mergedRegions
            .map((m) => {
                if (rowIdx < m.startRow) return { ...m, startRow: m.startRow - 1, endRow: m.endRow - 1 };
                if (rowIdx > m.endRow) return m;
                if (m.startRow === m.endRow) return null;
                return { ...m, endRow: m.endRow - 1 };
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol));
        t.rows.splice(rowIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.row >= t.rows.length) {
            state.activeCell.value.row = t.rows.length - 1;
        }
        deps.recalculate();
    }

    function deleteColumn(tableId: string, colIdx: number): void {
        const t = deps.findTable(tableId);
        if (!t || t.columns.length <= 1) return;
        deps.pushUndo();
        t.mergedRegions = t.mergedRegions
            .map((m) => {
                if (colIdx < m.startCol) return { ...m, startCol: m.startCol - 1, endCol: m.endCol - 1 };
                if (colIdx > m.endCol) return m;
                if (m.startCol === m.endCol) return null;
                return { ...m, endCol: m.endCol - 1 };
            })
            .filter((m): m is MergedRegion => m !== null && (m.startRow !== m.endRow || m.startCol !== m.endCol));
        t.columns.splice(colIdx, 1);
        for (const row of t.rows) row.splice(colIdx, 1);
        if (state.activeCell.value?.tableId === tableId && state.activeCell.value.col >= t.columns.length) {
            state.activeCell.value.col = t.columns.length - 1;
        }
        deps.recalculate();
    }

    function insertRowAt(tableId: string, rowIdx: number): void {
        const t = deps.findTable(tableId);
        if (!t) return;
        deps.pushUndo();
        t.mergedRegions = t.mergedRegions.map((m) => {
            if (rowIdx <= m.startRow) return { ...m, startRow: m.startRow + 1, endRow: m.endRow + 1 };
            if (rowIdx <= m.endRow) return { ...m, endRow: m.endRow + 1 };
            return m;
        });
        t.rows.splice(
            rowIdx,
            0,
            t.columns.map(() => createEmptyCell()),
        );
        deps.recalculate();
    }

    function insertColumnAt(tableId: string, colIdx: number): void {
        const t = deps.findTable(tableId);
        if (!t) return;
        deps.pushUndo();
        t.mergedRegions = t.mergedRegions.map((m) => {
            if (colIdx <= m.startCol) return { ...m, startCol: m.startCol + 1, endCol: m.endCol + 1 };
            if (colIdx <= m.endCol) return { ...m, endCol: m.endCol + 1 };
            return m;
        });
        t.columns.splice(colIdx, 0, { id: generateId('col'), width: 120 });
        for (const row of t.rows) row.splice(colIdx, 0, createEmptyCell());
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
        const sr = deps.getNormalizedSelection();
        if (!sr) return;
        const t = deps.findTable(sr.tableId);
        if (!t) return;
        if (sr.startCol !== 0 || sr.endCol !== t.columns.length - 1) return;
        const count = sr.endRow - sr.startRow + 1;
        if (count >= t.rows.length) return;
        deps.pushUndo();
        for (let r = sr.endRow; r >= sr.startRow; r--) {
            deleteRow(sr.tableId, r);
        }
        if (state.activeCell.value && state.activeCell.value.tableId === sr.tableId) {
            state.activeCell.value.row = Math.min(sr.startRow, t.rows.length - 1);
            state.activeCell.value.col = 0;
        }
        state.selectionRange.value = null;
    }

    function deleteSelectedColumns(): void {
        const sr = deps.getNormalizedSelection();
        if (!sr) return;
        const t = deps.findTable(sr.tableId);
        if (!t) return;
        if (sr.startRow !== 0 || sr.endRow !== t.rows.length - 1) return;
        const count = sr.endCol - sr.startCol + 1;
        if (count >= t.columns.length) return;
        deps.pushUndo();
        for (let c = sr.endCol; c >= sr.startCol; c--) {
            deleteColumn(sr.tableId, c);
        }
        if (state.activeCell.value && state.activeCell.value.tableId === sr.tableId) {
            state.activeCell.value.col = Math.min(sr.startCol, t.columns.length - 1);
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

export type SpreadsheetTables = ReturnType<typeof createTables>;
