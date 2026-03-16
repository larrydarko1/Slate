// useTableSort — column sorting for tables.
// Owns: sortColumn, getSortValue, compareValues.
// Does NOT own: CRUD (useTables.ts), reordering (useTableReorder.ts).

import type { SpreadsheetHelpers } from './helpers';
import type { SpreadsheetTable, Cell, CellValue, MergedRegion } from '../../types/spreadsheet';

interface SortDeps {
    findTable: SpreadsheetHelpers['findTable'];
    pushUndo: () => void;
    recalculate: () => void;
    remapAllFormulasInTable: (
        t: SpreadsheetTable,
        colMapper: ((col: number) => number) | null,
        rowMapper: ((row: number) => number) | null,
    ) => void;
}

export function createTableSort(deps: SortDeps) {
    function sortColumn(tableId: string, colIdx: number, direction: 'asc' | 'desc'): void {
        const t = deps.findTable(tableId);
        if (!t) return;
        deps.pushUndo();
        const headerCount = t.headerRows;

        function getSortValue(row: Cell[]): CellValue {
            const cell = row[colIdx];
            if (!cell) return null;
            return cell.formula != null ? (cell.computed ?? null) : cell.value;
        }

        function compareValues(a: CellValue, b: CellValue): number {
            const sign = direction === 'asc' ? 1 : -1;
            if (a === null && b === null) return 0;
            if (a === null) return 1;
            if (b === null) return -1;
            if (typeof a === 'number' && typeof b === 'number') return sign * (a - b);
            if (typeof a === 'boolean' && typeof b === 'boolean') return sign * (Number(a) - Number(b));
            const sa = String(a).toLowerCase();
            const sb = String(b).toLowerCase();
            if (sa < sb) return -sign;
            if (sa > sb) return sign;
            return 0;
        }

        const indexed = t.rows.slice(headerCount).map((row, i) => ({ row, origIdx: i + headerCount }));
        indexed.sort((a, b) => compareValues(getSortValue(a.row), getSortValue(b.row)));

        for (let i = 0; i < indexed.length; i++) {
            t.rows[headerCount + i] = indexed[i].row;
        }

        const rowMap = new Map<number, number>();
        for (let i = 0; i < indexed.length; i++) {
            rowMap.set(indexed[i].origIdx, headerCount + i);
        }
        for (let i = 0; i < headerCount; i++) {
            rowMap.set(i, i);
        }

        t.mergedRegions = t.mergedRegions
            .map((m) => {
                if (m.startRow === m.endRow) {
                    const newRow = rowMap.get(m.startRow) ?? m.startRow;
                    return { ...m, startRow: newRow, endRow: newRow };
                }
                if (m.endRow < headerCount) return m;
                return null;
            })
            .filter((m): m is MergedRegion => m !== null);

        const rowMapper = (idx: number) => rowMap.get(idx) ?? idx;
        deps.remapAllFormulasInTable(t, null, rowMapper);
        deps.recalculate();
    }

    return { sortColumn };
}

export type TableSort = ReturnType<typeof createTableSort>;
