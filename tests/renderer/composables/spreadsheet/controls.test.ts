import { describe, it, expect, beforeEach } from 'vitest';

import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('controls', () => {
    let ss: SpreadsheetState;
    let id: string;

    function makeCheckbox(col: number, row: number, raw: string): void {
        ss.setCellValue(id, col, row, raw);
        ss.setCellType(id, col, row, 'checkbox');
    }

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0]!.id;
    });

    describe('toggleCheckbox', () => {
        it('ticks an empty box and unticks a ticked one', () => {
            makeCheckbox(0, 0, '');
            ss.toggleCheckbox(id, 0, 0);
            expect(ss.findCell(id, 0, 0)?.value).toBe(true);
            ss.toggleCheckbox(id, 0, 0);
            expect(ss.findCell(id, 0, 0)?.value).toBe(false);
        });

        it('undoes', async () => {
            makeCheckbox(0, 0, '');
            await Promise.resolve();
            ss.toggleCheckbox(id, 0, 0);
            ss.undo();
            expect(ss.findCell(id, 0, 0)?.value).toBeNull();
        });

        it('recalculates formulas that read the box', () => {
            makeCheckbox(0, 0, '');
            ss.setCellValue(id, 1, 0, '=IF(A1, "Done", "To do")');
            expect(ss.getDisplayValue(id, 1, 0)).toBe('To do');
            ss.toggleCheckbox(id, 0, 0);
            expect(ss.getDisplayValue(id, 1, 0)).toBe('Done');
        });

        it('leaves a cell that is not a checkbox alone', () => {
            ss.setCellValue(id, 0, 0, 'TRUE');
            ss.toggleCheckbox(id, 0, 0);
            expect(ss.findCell(id, 0, 0)?.value).toBe(1);
        });

        it('leaves a formula checkbox alone, since its formula decides', () => {
            ss.setCellValue(id, 0, 0, '=1>0');
            ss.setCellType(id, 0, 0, 'checkbox');
            ss.toggleCheckbox(id, 0, 0);
            expect(ss.findCell(id, 0, 0)?.computed).toBe(true);
        });
    });

    describe('toggleSelectionCheckboxes', () => {
        it('gives every box in the selection the opposite of the active one', () => {
            makeCheckbox(0, 0, 'false');
            makeCheckbox(0, 1, 'true');
            makeCheckbox(0, 2, 'false');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 0, 2);
            ss.toggleSelectionCheckboxes();
            expect([0, 1, 2].map((r) => ss.findCell(id, 0, r)?.value)).toEqual([true, true, true]);
        });

        it('skips cells in the selection that are not checkboxes', () => {
            makeCheckbox(0, 0, '');
            ss.setCellValue(id, 0, 1, 'note');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 0, 1);
            ss.toggleSelectionCheckboxes();
            expect(ss.findCell(id, 0, 1)?.value).toBe('note');
        });

        it('does nothing when the active cell is not a checkbox', () => {
            ss.setCellValue(id, 0, 0, 'note');
            makeCheckbox(0, 1, '');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 0, 1);
            ss.toggleSelectionCheckboxes();
            expect(ss.findCell(id, 0, 1)?.value).toBeNull();
        });

        it('does nothing with no active cell', () => {
            makeCheckbox(0, 0, '');
            ss.toggleSelectionCheckboxes();
            expect(ss.findCell(id, 0, 0)?.value).toBeNull();
        });
    });

    describe('isActiveCellCheckbox', () => {
        it('is true for a checkbox someone can tick', () => {
            makeCheckbox(0, 0, '');
            ss.selectCell(id, 0, 0);
            expect(ss.isActiveCellCheckbox()).toBe(true);
        });

        it('is false for a formula checkbox, a plain cell, or no selection', () => {
            expect(ss.isActiveCellCheckbox()).toBe(false);
            ss.setCellValue(id, 0, 0, '=1>0');
            ss.setCellType(id, 0, 0, 'checkbox');
            ss.selectCell(id, 0, 0);
            expect(ss.isActiveCellCheckbox()).toBe(false);
            ss.selectCell(id, 1, 0);
            expect(ss.isActiveCellCheckbox()).toBe(false);
        });
    });
});
