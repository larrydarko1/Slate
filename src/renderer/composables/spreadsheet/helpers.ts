/**
 * helpers — finder functions, z-index management, selection queries, name-pattern utilities.
 * Owns: table/textbox/chart lookups, bringToFront, selection normalization, ref name quoting.
 * Does NOT own: reactive state (state.ts), business logic (sub-composables).
 */

import type { SpreadsheetCoreState } from '@/renderer/composables/spreadsheet/state';
import type { SpreadsheetTable, Canvas, TextBox, ChartObject, SelectionRange } from '@/renderer/types/spreadsheet';

export type SpreadsheetHelpers = {
    findTable: (id: string) => SpreadsheetTable | null;
    findTableGlobal: (id: string) => { table: SpreadsheetTable; canvas: Canvas } | null;
    findTableByName: (tableName: string, scope?: TableNameScope) => SpreadsheetTable | null;
    findTextBox: (id: string) => TextBox | null;
    findChart: (id: string) => ChartObject | null;
    bringToFront: (tableId: string) => void;
    bringToFrontById: (id: string) => void;
    recalculateMaxZ: () => void;
    findNormalizedSelection: () => SelectionRange | null;
    isInSelection: (tableId: string, col: number, row: number) => boolean;
    isRowInSelection: (tableId: string, row: number) => boolean;
    isColInSelection: (tableId: string, col: number) => boolean;
    isEntireTableSelected: (tableId: string) => boolean;
    hasMultiCellSelection: () => boolean;
    quoteRefName: (n: string) => string;
    replaceNameInRef: (ref: string, oldName: string, newName: string) => string;
};

/**
 * Where an unqualified `Table::A1` reference is allowed to resolve. A qualified
 * reference names its canvas; an unqualified one resolves against the canvas it
 * was written on before searching the rest of the workbook.
 */
type TableNameScope = {
    canvasName?: string | null;
    sourceCanvasId?: string;
};

export function createHelpers(state: SpreadsheetCoreState): SpreadsheetHelpers {
    // ─── Finder functions ────────────────────────────────────────────────────

    function findTable(id: string): SpreadsheetTable | null {
        // Fast path: check the active canvas first
        const local = state.activeCanvas.value.tables.find((t): boolean => t.id === id);
        if (local !== undefined) return local;
        // Fall back to global search (needed for cross-canvas formulas)
        return findTableGlobal(id)?.table ?? null;
    }

    function findTableGlobal(id: string): { table: SpreadsheetTable; canvas: Canvas } | null {
        for (const cv of state.canvases.value) {
            const table = cv.tables.find((t): boolean => t.id === id);
            if (table !== undefined) return { table, canvas: cv };
        }
        return null;
    }

    function findTableByName(tableName: string, scope: TableNameScope = {}): SpreadsheetTable | null {
        const nameMatch = (a: string, b: string): boolean =>
            a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
        const { canvasName, sourceCanvasId } = scope;

        // An explicit canvas name means the reference is qualified: resolve it
        // there or nowhere.
        if (canvasName !== undefined && canvasName !== null && canvasName !== '') {
            const cv = state.canvases.value.find((c): boolean => nameMatch(c.name, canvasName));
            if (cv === undefined) return null;
            return cv.tables.find((t): boolean => nameMatch(t.name, tableName)) ?? null;
        }

        // An unqualified reference prefers a table on its own canvas before
        // falling back to the rest of the workbook.
        if (sourceCanvasId !== undefined && sourceCanvasId !== '') {
            const srcCv = state.canvases.value.find((c): boolean => c.id === sourceCanvasId);
            const local = srcCv?.tables.find((t): boolean => nameMatch(t.name, tableName));
            if (local !== undefined) return local;
        }

        for (const cv of state.canvases.value) {
            const table = cv.tables.find((t): boolean => nameMatch(t.name, tableName));
            if (table !== undefined) return table;
        }
        return null;
    }

    function findTextBox(id: string): TextBox | null {
        return state.activeCanvas.value.textBoxes.find((tb): boolean => tb.id === id) ?? null;
    }

    function findChart(id: string): ChartObject | null {
        return state.charts.value.find((ch): boolean => ch.id === id) ?? null;
    }

    // ─── Z-index management ──────────────────────────────────────────────────

    function bringToFront(tableId: string): void {
        const table = findTable(tableId);
        if (table !== null) table.zIndex = ++state.counters.maxZ;
    }

    function bringToFrontById(id: string): void {
        const table = findTable(id);
        if (table !== null) {
            table.zIndex = ++state.counters.maxZ;
            return;
        }
        const tb = findTextBox(id);
        if (tb !== null) {
            tb.zIndex = ++state.counters.maxZ;
            return;
        }
        const ch = findChart(id);
        if (ch !== null) ch.zIndex = ++state.counters.maxZ;
    }

    /** Recalculate maxZ from the active canvas items */
    function recalculateMaxZ(): void {
        const cv = state.activeCanvas.value;
        state.counters.maxZ = Math.max(
            0,
            ...cv.tables.map((t): number => t.zIndex),
            ...cv.textBoxes.map((tb): number => tb.zIndex),
            ...cv.charts.map((ch): number => ch.zIndex),
        );
    }

    // ─── Selection queries ───────────────────────────────────────────────────

    function findNormalizedSelection(): SelectionRange | null {
        const sr = state.selectionRange.value;
        if (sr === null) return null;
        return {
            tableId: sr.tableId,
            startCol: Math.min(sr.startCol, sr.endCol),
            startRow: Math.min(sr.startRow, sr.endRow),
            endCol: Math.max(sr.startCol, sr.endCol),
            endRow: Math.max(sr.startRow, sr.endRow),
        };
    }

    function isInSelection(tableId: string, col: number, row: number): boolean {
        const sr = findNormalizedSelection();
        if (sr === null || sr.tableId !== tableId) return false;
        return col >= sr.startCol && col <= sr.endCol && row >= sr.startRow && row <= sr.endRow;
    }

    function isRowInSelection(tableId: string, row: number): boolean {
        const sr = findNormalizedSelection();
        if (sr === null || sr.tableId !== tableId) return false;
        const table = findTable(tableId);
        if (table === null) return false;
        return row >= sr.startRow && row <= sr.endRow && sr.startCol === 0 && sr.endCol === table.columns.length - 1;
    }

    function isColInSelection(tableId: string, col: number): boolean {
        const sr = findNormalizedSelection();
        if (sr === null || sr.tableId !== tableId) return false;
        const table = findTable(tableId);
        if (table === null) return false;
        return col >= sr.startCol && col <= sr.endCol && sr.startRow === 0 && sr.endRow === table.rows.length - 1;
    }

    function isEntireTableSelected(tableId: string): boolean {
        const sr = findNormalizedSelection();
        if (sr === null || sr.tableId !== tableId) return false;
        const table = findTable(tableId);
        if (table === null) return false;
        return (
            sr.startCol === 0 &&
            sr.startRow === 0 &&
            sr.endCol === table.columns.length - 1 &&
            sr.endRow === table.rows.length - 1
        );
    }

    function hasMultiCellSelection(): boolean {
        const sr = findNormalizedSelection();
        if (sr === null) return false;
        return sr.startCol !== sr.endCol || sr.startRow !== sr.endRow;
    }

    // ─── Name-pattern utilities ──────────────────────────────────────────────

    function quoteRefName(n: string): string {
        return /^[A-Za-z_]\w*$/.test(n) ? n : `'${n}'`;
    }

    function buildNamePattern(name: string): RegExp {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:'${escaped}'|\\b${escaped}\\b)(?=::)`, 'g');
    }

    function replaceNameInRef(ref: string, oldName: string, newName: string): string {
        const pattern = buildNamePattern(oldName);
        return ref.replace(pattern, quoteRefName(newName));
    }

    return {
        findTable,
        findTableGlobal,
        findTableByName,
        findTextBox,
        findChart,
        bringToFront,
        bringToFrontById,
        recalculateMaxZ,
        findNormalizedSelection,
        isInSelection,
        isRowInSelection,
        isColInSelection,
        isEntireTableSelected,
        hasMultiCellSelection,
        quoteRefName,
        replaceNameInRef,
    };
}
