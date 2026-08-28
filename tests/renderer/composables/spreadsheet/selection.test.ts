import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('selection', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
    });

    describe('selectCell', () => {
        it('sets the active cell and a one-cell range', () => {
            ss.selectCell(id, 2, 3);
            expect(ss.activeCell.value).toEqual({ tableId: id, col: 2, row: 3 });
            expect(ss.selectionRange.value).toEqual({
                tableId: id,
                startCol: 2,
                startRow: 3,
                endCol: 2,
                endRow: 3,
            });
        });

        it('clears an active text box and chart', () => {
            ss.addTextBox();
            ss.selectTextBox(ss.textBoxes.value[0].id);
            ss.selectCell(id, 0, 0);
            expect(ss.activeTextBoxId.value).toBeNull();
            expect(ss.activeChartId.value).toBeNull();
        });

        it('brings the table to the front', () => {
            ss.addTable();
            const second = ss.tables.value[1];
            ss.selectCell(id, 0, 0);
            expect(ss.tables.value[0].zIndex).toBeGreaterThan(second.zIndex);
        });

        it('commits an open edit first', () => {
            ss.selectCell(id, 0, 0);
            ss.startEditing('typed');
            ss.selectCell(id, 1, 1);
            expect(ss.isEditing.value).toBe(false);
            expect(ss.getDisplayValue(id, 0, 0)).toBe('typed');
        });
    });

    describe('selectRow and selectColumn', () => {
        it('selects a whole row', () => {
            ss.selectRow(id, 2);
            expect(ss.selectionRange.value).toMatchObject({ startCol: 0, endCol: 4, startRow: 2, endRow: 2 });
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 2 });
        });

        it('selects a whole column', () => {
            ss.selectColumn(id, 1);
            expect(ss.selectionRange.value).toMatchObject({ startCol: 1, endCol: 1, startRow: 0, endRow: 7 });
        });

        it('selects the whole table', () => {
            ss.selectAll(id);
            expect(ss.selectionRange.value).toMatchObject({ startCol: 0, startRow: 0, endCol: 4, endRow: 7 });
        });

        it('ignores an unknown table', () => {
            ss.selectRow('nope', 0);
            ss.selectColumn('nope', 0);
            ss.selectAll('nope');
            expect(ss.activeCell.value).toBeNull();
        });
    });

    describe('extending', () => {
        it('extends from the anchor to the given cell', () => {
            ss.selectCell(id, 1, 1);
            ss.extendSelection(id, 3, 4);
            expect(ss.selectionRange.value).toMatchObject({ startCol: 1, startRow: 1, endCol: 3, endRow: 4 });
        });

        it('extends backwards, leaving the range unnormalised', () => {
            ss.selectCell(id, 3, 3);
            ss.extendSelection(id, 1, 1);
            expect(ss.selectionRange.value).toMatchObject({ startCol: 3, startRow: 3, endCol: 1, endRow: 1 });
        });

        it('extends a row selection across full rows', () => {
            ss.selectRow(id, 1);
            ss.extendRowSelection(id, 3);
            expect(ss.selectionRange.value).toMatchObject({ startCol: 0, endCol: 4, startRow: 1, endRow: 3 });
        });

        it('extends a column selection across full columns', () => {
            ss.selectColumn(id, 1);
            ss.extendColumnSelection(id, 3);
            expect(ss.selectionRange.value).toMatchObject({ startRow: 0, endRow: 7, startCol: 1, endCol: 3 });
        });

        it('does nothing with no active cell', () => {
            ss.extendSelection(id, 1, 1);
            expect(ss.selectionRange.value).toBeNull();
        });

        it('does nothing when the anchor is in another table', () => {
            ss.addTable();
            ss.selectCell(id, 0, 0);
            ss.extendSelection(ss.tables.value[1].id, 2, 2);
            expect(ss.selectionRange.value).toMatchObject({ tableId: id, endCol: 0, endRow: 0 });
        });

        it('ignores an unknown table when extending rows or columns', () => {
            ss.selectCell(id, 0, 0);
            ss.extendRowSelection('nope', 2);
            ss.extendColumnSelection('nope', 2);
            expect(ss.selectionRange.value).toMatchObject({ endCol: 0, endRow: 0 });
        });
    });

    describe('moveSelection', () => {
        it('moves the active cell by a delta', () => {
            ss.selectCell(id, 1, 1);
            ss.moveSelection(1, 2);
            expect(ss.activeCell.value).toMatchObject({ col: 2, row: 3 });
        });

        /**
         * Documents a gap. moveSelection moves `activeCell` and nothing else, so
         * an arrow key after a drag-select leaves the old range in place — and
         * copy, clear and format all read that range, not the cell.
         */
        it('leaves the previous range behind', () => {
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 3, 3);
            ss.moveSelection(0, 1);
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 1 });
            expect(ss.selectionRange.value).toMatchObject({ startCol: 0, startRow: 0, endCol: 3, endRow: 3 });
        });

        it('clamps at the top-left edge', () => {
            ss.selectCell(id, 0, 0);
            ss.moveSelection(-1, -1);
            expect(ss.activeCell.value).toMatchObject({ col: 0, row: 0 });
        });

        it('does nothing with no active cell', () => {
            ss.moveSelection(1, 1);
            expect(ss.activeCell.value).toBeNull();
        });
    });
});
