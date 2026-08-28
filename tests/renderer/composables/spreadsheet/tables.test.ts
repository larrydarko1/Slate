import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

/**
 * Driven through the assembled orchestrator rather than the factory in
 * isolation: row and column edits have to rewrite formulas and merged regions
 * at the same time, and those live in other modules. A table test that stubs
 * them out asserts the half that cannot break.
 */
function firstTable(ss: SpreadsheetState) {
    return ss.tables.value[0];
}

describe('tables', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = firstTable(ss).id;
    });

    describe('CRUD', () => {
        it('creates a table with the default 5x8 grid', () => {
            const table = firstTable(ss);
            expect(table.columns).toHaveLength(5);
            expect(table.rows).toHaveLength(8);
            expect(table.rows[0]).toHaveLength(5);
        });

        it('numbers each new table', () => {
            ss.addTable();
            expect(ss.tables.value.map((t) => t.name)).toEqual(['Table 1', 'Table 2']);
        });

        it('stacks each new table above the last', () => {
            ss.addTable();
            expect(ss.tables.value[1].zIndex).toBeGreaterThan(ss.tables.value[0].zIndex);
        });

        it('removes a table', () => {
            ss.addTable();
            ss.removeTable(id);
            expect(ss.tables.value).toHaveLength(1);
            expect(ss.tables.value[0].name).toBe('Table 2');
        });

        it('clears the active cell when its table is removed', () => {
            ss.selectCell(id, 0, 0);
            ss.removeTable(id);
            expect(ss.activeCell.value).toBeNull();
        });

        it('leaves the active cell alone when a different table is removed', () => {
            ss.addTable();
            ss.selectCell(id, 1, 1);
            ss.removeTable(ss.tables.value[1].id);
            expect(ss.activeCell.value).toEqual({ tableId: id, col: 1, row: 1 });
        });

        it('renames a table', () => {
            ss.renameTable(id, 'Sales');
            expect(firstTable(ss).name).toBe('Sales');
        });

        it('rewrites references when a table is renamed', () => {
            ss.addTable();
            const other = ss.tables.value[1];
            ss.setCellValue(id, 0, 0, '7');
            ss.setCellValue(other.id, 0, 0, '=Table 1::A1');
            ss.renameTable(id, 'Renamed');
            expect(ss.getRawValue(other.id, 0, 0)).toContain('Renamed');
            expect(ss.getDisplayValue(other.id, 0, 0)).toBe('7');
        });

        it('ignores a rename to the same name', () => {
            ss.renameTable(id, 'Table 1');
            expect(firstTable(ss).name).toBe('Table 1');
        });

        it('ignores a rename of an unknown table', () => {
            ss.renameTable('nope', 'X');
            expect(firstTable(ss).name).toBe('Table 1');
        });

        it('moves a table', () => {
            ss.moveTable(id, 42, 84);
            expect(firstTable(ss).x).toBe(42);
            expect(firstTable(ss).y).toBe(84);
        });

        it('ignores a move of an unknown table', () => {
            const { x, y } = firstTable(ss);
            ss.moveTable('nope', 1, 1);
            expect(firstTable(ss).x).toBe(x);
            expect(firstTable(ss).y).toBe(y);
        });
    });

    describe('rows and columns', () => {
        it('appends a row the width of the table', () => {
            ss.addRow(id);
            const table = firstTable(ss);
            expect(table.rows).toHaveLength(9);
            expect(table.rows[8]).toHaveLength(5);
        });

        it('appends a column to every row', () => {
            ss.addColumn(id);
            const table = firstTable(ss);
            expect(table.columns).toHaveLength(6);
            expect(table.rows.every((r) => r.length === 6)).toBe(true);
        });

        it('ignores add on an unknown table', () => {
            ss.addRow('nope');
            ss.addColumn('nope');
            expect(firstTable(ss).rows).toHaveLength(8);
        });

        it('reports an untouched row as empty', () => {
            expect(ss.isRowEmpty(id, 0)).toBe(true);
        });

        it('reports a row holding a value as not empty', () => {
            ss.setCellValue(id, 2, 0, 'x');
            expect(ss.isRowEmpty(id, 0)).toBe(false);
        });

        it('reports a row holding only a formula as not empty', () => {
            ss.setCellValue(id, 2, 0, '=1+1');
            expect(ss.isRowEmpty(id, 0)).toBe(false);
        });

        it('reports an out-of-range row as not empty', () => {
            expect(ss.isRowEmpty(id, 99)).toBe(false);
            expect(ss.isRowEmpty(id, -1)).toBe(false);
        });

        it('reports column emptiness the same way', () => {
            expect(ss.isColumnEmpty(id, 0)).toBe(true);
            ss.setCellValue(id, 0, 3, 'x');
            expect(ss.isColumnEmpty(id, 0)).toBe(false);
            expect(ss.isColumnEmpty(id, 99)).toBe(false);
        });

        it('trims a trailing empty row', () => {
            expect(ss.removeLastRowIfEmpty(id)).toBe(true);
            expect(firstTable(ss).rows).toHaveLength(7);
        });

        it('refuses to trim a trailing row that holds a value', () => {
            ss.setCellValue(id, 0, 7, 'keep');
            expect(ss.removeLastRowIfEmpty(id)).toBe(false);
            expect(firstTable(ss).rows).toHaveLength(8);
        });

        it('refuses to trim a trailing row covered by a merge', () => {
            ss.mergeCells(id, 0, 6, 1, 7);
            expect(ss.removeLastRowIfEmpty(id)).toBe(false);
        });

        it('refuses to trim the last remaining row', () => {
            for (let i = 0; i < 7; i++) ss.removeLastRowIfEmpty(id);
            expect(firstTable(ss).rows).toHaveLength(1);
            expect(ss.removeLastRowIfEmpty(id)).toBe(false);
        });

        it('pulls the active cell back when the row under it is trimmed', () => {
            ss.selectCell(id, 0, 7);
            ss.removeLastRowIfEmpty(id);
            expect(ss.activeCell.value?.row).toBe(6);
        });

        it('trims a trailing empty column the same way', () => {
            expect(ss.removeLastColumnIfEmpty(id)).toBe(true);
            expect(firstTable(ss).columns).toHaveLength(4);
            ss.setCellValue(id, 3, 0, 'keep');
            expect(ss.removeLastColumnIfEmpty(id)).toBe(false);
        });

        it('refuses to trim a trailing column covered by a merge', () => {
            ss.mergeCells(id, 3, 0, 4, 1);
            expect(ss.removeLastColumnIfEmpty(id)).toBe(false);
        });

        it('pulls the active cell back when the column under it is trimmed', () => {
            ss.selectCell(id, 4, 0);
            ss.removeLastColumnIfEmpty(id);
            expect(ss.activeCell.value?.col).toBe(3);
        });

        it('deletes a row and shifts the ones below it up', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 0, 1, 'b');
            ss.deleteRow(id, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('b');
            expect(firstTable(ss).rows).toHaveLength(7);
        });

        it('refuses to delete the only row', () => {
            for (let i = 0; i < 7; i++) ss.deleteRow(id, 0);
            expect(firstTable(ss).rows).toHaveLength(1);
            ss.deleteRow(id, 0);
            expect(firstTable(ss).rows).toHaveLength(1);
        });

        it('deletes a column and shifts the ones right of it left', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 1, 0, 'b');
            ss.deleteColumn(id, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('b');
            expect(firstTable(ss).columns).toHaveLength(4);
        });

        it('refuses to delete the only column', () => {
            for (let i = 0; i < 4; i++) ss.deleteColumn(id, 0);
            expect(firstTable(ss).columns).toHaveLength(1);
            ss.deleteColumn(id, 0);
            expect(firstTable(ss).columns).toHaveLength(1);
        });

        it('drops a single-row merge when that row is deleted', () => {
            ss.mergeCells(id, 0, 2, 2, 2);
            ss.deleteRow(id, 2);
            expect(firstTable(ss).mergedRegions).toHaveLength(0);
        });

        it('shrinks a multi-row merge when a row inside it is deleted', () => {
            ss.mergeCells(id, 0, 1, 1, 3);
            ss.deleteRow(id, 2);
            expect(firstTable(ss).mergedRegions[0]).toMatchObject({ startRow: 1, endRow: 2 });
        });

        it('shifts a merge up when a row above it is deleted', () => {
            ss.mergeCells(id, 0, 4, 1, 5);
            ss.deleteRow(id, 0);
            expect(firstTable(ss).mergedRegions[0]).toMatchObject({ startRow: 3, endRow: 4 });
        });

        it('inserts a row at a position', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.insertRowAt(id, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
            expect(ss.getDisplayValue(id, 0, 1)).toBe('a');
            expect(firstTable(ss).rows).toHaveLength(9);
        });

        it('inserts a column at a position', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.insertColumnAt(id, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
            expect(ss.getDisplayValue(id, 1, 0)).toBe('a');
            expect(firstTable(ss).columns).toHaveLength(6);
        });

        /**
         * Documents a gap, not a guarantee. `reorderRow` and `sortColumn` remap
         * every formula in the table through `remapAllFormulasInTable`; insert
         * and delete do not, so a reference across the insert point keeps its
         * old coordinates and now reads a different cell.
         */
        it('does not re-point a formula across a row insert', () => {
            ss.setCellValue(id, 0, 3, '9');
            ss.setCellValue(id, 1, 0, '=A4');
            ss.insertRowAt(id, 0);
            expect(ss.getRawValue(id, 1, 1)).toBe('=A4');
            expect(ss.getDisplayValue(id, 1, 1)).toBe('');
        });
    });

    describe('reordering', () => {
        beforeEach(() => {
            for (let r = 0; r < 4; r++) ss.setCellValue(id, 0, r, `r${r}`);
        });

        it('moves a row down', () => {
            ss.reorderRow(id, 0, 2);
            expect(ss.getDisplayValue(id, 0, 2)).toBe('r0');
        });

        it('moves a row up', () => {
            ss.reorderRow(id, 3, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('r3');
        });

        it('moves a block of rows', () => {
            ss.reorderRows(id, 0, 1, 3);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('r2');
        });

        it('moves a column', () => {
            ss.setCellValue(id, 1, 0, 'c1');
            ss.reorderColumn(id, 1, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('c1');
        });

        it('moves a block of columns', () => {
            ss.setCellValue(id, 1, 0, 'c1');
            ss.setCellValue(id, 2, 0, 'c2');
            ss.reorderColumns(id, 1, 2, 0);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('c1');
            expect(ss.getDisplayValue(id, 1, 0)).toBe('c2');
        });

        it('ignores a reorder on an unknown table', () => {
            ss.reorderRow('nope', 0, 1);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('r0');
        });
    });

    describe('sorting', () => {
        // Row 0 is the header row (`headerRows: 1` by default) and never sorts,
        // so every fixture here starts at row 1.
        beforeEach(() => {
            ss.setCellValue(id, 0, 0, 'Header');
            ss.setCellValue(id, 0, 1, '3');
            ss.setCellValue(id, 0, 2, '1');
            ss.setCellValue(id, 0, 3, '2');
        });

        it('sorts a column ascending', () => {
            ss.sortColumn(id, 0, 'asc');
            expect([1, 2, 3].map((r) => ss.getDisplayValue(id, 0, r))).toEqual(['1', '2', '3']);
        });

        it('sorts a column descending', () => {
            ss.sortColumn(id, 0, 'desc');
            expect([1, 2, 3].map((r) => ss.getDisplayValue(id, 0, r))).toEqual(['3', '2', '1']);
        });

        it('leaves the header row in place', () => {
            ss.sortColumn(id, 0, 'asc');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('Header');
        });

        it('sorts blank cells to the end', () => {
            ss.sortColumn(id, 0, 'asc');
            expect(ss.getDisplayValue(id, 0, 4)).toBe('');
        });

        it('carries the rest of the row along', () => {
            ss.setCellValue(id, 1, 1, 'three');
            ss.setCellValue(id, 1, 2, 'one');
            ss.setCellValue(id, 1, 3, 'two');
            ss.sortColumn(id, 0, 'asc');
            expect([1, 2, 3].map((r) => ss.getDisplayValue(id, 1, r))).toEqual(['one', 'two', 'three']);
        });

        it('sorts text case-insensitively', () => {
            ss.setCellValue(id, 1, 1, 'Pear');
            ss.setCellValue(id, 1, 2, 'apple');
            ss.setCellValue(id, 1, 3, 'Fig');
            ss.sortColumn(id, 1, 'asc');
            expect([1, 2, 3].map((r) => ss.getDisplayValue(id, 1, r))).toEqual(['apple', 'Fig', 'Pear']);
        });

        it('re-points a formula at the row it followed', () => {
            ss.setCellValue(id, 1, 1, '=A2');
            ss.sortColumn(id, 0, 'asc');
            expect(ss.getDisplayValue(id, 1, 3)).toBe('3');
        });

        it('ignores a sort on an unknown table', () => {
            ss.sortColumn('nope', 0, 'asc');
            expect(ss.getDisplayValue(id, 0, 1)).toBe('3');
        });
    });

    describe('deleting the selection', () => {
        it('deletes every selected row', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 0, 2, 'c');
            ss.selectRow(id, 0);
            ss.extendRowSelection(id, 1);
            ss.deleteSelectedRows();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('c');
            expect(firstTable(ss).rows).toHaveLength(6);
        });

        it('deletes every selected column', () => {
            ss.setCellValue(id, 0, 0, 'a');
            ss.setCellValue(id, 2, 0, 'c');
            ss.selectColumn(id, 0);
            ss.extendColumnSelection(id, 1);
            ss.deleteSelectedColumns();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('c');
            expect(firstTable(ss).columns).toHaveLength(3);
        });

        it('does nothing with no selection', () => {
            ss.deleteSelectedRows();
            ss.deleteSelectedColumns();
            expect(firstTable(ss).rows).toHaveLength(8);
            expect(firstTable(ss).columns).toHaveLength(5);
        });
    });
});
