import { describe, it, expect, beforeEach } from 'vitest';

import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('controls', () => {
    let ss: SpreadsheetState;
    let id: string;

    function makeCheckbox(col: number, row: number, raw: string): void {
        ss.setCellValue(id, col, row, raw);
        ss.setCellType(id, col, row, 'checkbox');
    }

    function makeRating(col: number, row: number, raw: string): void {
        ss.setCellValue(id, col, row, raw);
        ss.setCellType(id, col, row, 'rating');
    }

    /** Selects A1 to A`rows`, with A1 active. */
    function selectColumnA(rows: number): void {
        ss.selectCell(id, 0, 0);
        ss.extendSelection(id, 0, rows - 1);
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

    describe('star ratings', () => {
        describe('making a cell a rating', () => {
            it.each([
                ['3', 3],
                ['5', 5],
                ['1', 1],
            ])('gives %s that many stars', (raw, stars) => {
                makeRating(0, 0, raw);
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: stars, cellType: 'rating' });
            });

            it('makes 0 and an empty cell unrated', () => {
                makeRating(0, 0, '0');
                makeRating(0, 1, '');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: null, cellType: 'rating' });
                expect(ss.findCell(id, 0, 1)).toMatchObject({ value: null, cellType: 'rating' });
            });

            it.each([
                ['7', 7, 'integer'],
                ['2.5', 2.5, 'float'],
                ['-1', -1, 'integer'],
                ['great', 'great', 'text'],
            ])('leaves %s as it is, since no rating shows it', (raw, value, cellType) => {
                makeRating(0, 0, raw);
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value, cellType });
            });

            it('gives the plain number back when changed to another type', () => {
                makeRating(0, 0, '4');
                ss.setCellType(id, 0, 0, 'integer');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 4, cellType: 'integer' });
            });

            it('takes the stars away from an unrated cell given another type', () => {
                makeRating(0, 0, '');
                ss.setCellType(id, 0, 0, 'text');
                expect(ss.getCellType(id, 0, 0)).toBe('empty');
            });
        });

        describe('typing into a rating', () => {
            it('sets the rating to a typed 0 to 5, 0 being none', () => {
                makeRating(0, 0, '2');
                ss.setCellValue(id, 0, 0, '4');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 4, cellType: 'rating' });
                ss.setCellValue(id, 0, 0, '0');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: null, cellType: 'rating' });
            });

            it('clears it on Delete and keeps the stars', () => {
                makeRating(0, 0, '3');
                ss.selectCell(id, 0, 0);
                ss.clearActiveCell();
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: null, cellType: 'rating' });
            });

            it('becomes an ordinary cell when something no rating shows is typed', () => {
                makeRating(0, 0, '3');
                ss.setCellValue(id, 0, 0, '7');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 7, cellType: 'integer' });
            });

            it('edits as its number, or nothing when unrated', () => {
                makeRating(0, 0, '3');
                makeRating(0, 1, '');
                expect(ss.getRawValue(id, 0, 0)).toBe('3');
                expect(ss.getRawValue(id, 0, 1)).toBe('');
            });
        });

        describe('setRating', () => {
            it('sets the rating to the star clicked', () => {
                makeRating(0, 0, '');
                ss.setRating(id, 0, 0, 4);
                expect(ss.findCell(id, 0, 0)?.value).toBe(4);
                ss.setRating(id, 0, 0, 2);
                expect(ss.findCell(id, 0, 0)?.value).toBe(2);
            });

            it('clears the rating when its own star is clicked again', () => {
                makeRating(0, 0, '3');
                ss.setRating(id, 0, 0, 3);
                expect(ss.findCell(id, 0, 0)?.value).toBeNull();
            });

            it('undoes', async () => {
                makeRating(0, 0, '2');
                await Promise.resolve();
                ss.setRating(id, 0, 0, 5);
                ss.undo();
                expect(ss.findCell(id, 0, 0)?.value).toBe(2);
            });

            it('recalculates formulas that read the rating', () => {
                makeRating(0, 0, '2');
                ss.setCellValue(id, 1, 0, '=A1*2');
                ss.setRating(id, 0, 0, 5);
                expect(ss.getDisplayValue(id, 1, 0)).toBe('10');
            });

            it('leaves a formula rating alone, since its formula decides', () => {
                ss.setCellValue(id, 0, 0, '=1+1');
                ss.setCellType(id, 0, 0, 'rating');
                ss.setRating(id, 0, 0, 5);
                expect(ss.findCell(id, 0, 0)?.computed).toBe(2);
            });

            it('leaves a cell that is not a rating alone', () => {
                ss.setCellValue(id, 0, 0, '3');
                ss.setRating(id, 0, 0, 5);
                expect(ss.findCell(id, 0, 0)?.value).toBe(3);
            });
        });

        describe('handleControlKey', () => {
            it('rates every rating in the selection with a digit', () => {
                makeRating(0, 0, '1');
                makeRating(0, 1, '');
                ss.setCellValue(id, 0, 2, 'note');
                selectColumnA(3);
                expect(ss.handleControlKey('4')).toBe(true);
                expect([0, 1, 2].map((r) => ss.findCell(id, 0, r)?.value)).toEqual([4, 4, 'note']);
            });

            it('clears the ratings with 0, and sets the same digit twice without clearing', () => {
                makeRating(0, 0, '3');
                selectColumnA(1);
                ss.handleControlKey('3');
                expect(ss.findCell(id, 0, 0)?.value).toBe(3);
                ss.handleControlKey('0');
                expect(ss.findCell(id, 0, 0)?.value).toBeNull();
            });

            it.each([['6'], ['9'], [' '], ['a']])('leaves %j to be typed on a rating', (key) => {
                makeRating(0, 0, '2');
                selectColumnA(1);
                expect(ss.handleControlKey(key)).toBe(false);
                expect(ss.findCell(id, 0, 0)?.value).toBe(2);
            });

            it('leaves a digit to be typed on a formula rating or an ordinary cell', () => {
                ss.setCellValue(id, 0, 0, '=1+1');
                ss.setCellType(id, 0, 0, 'rating');
                ss.selectCell(id, 0, 0);
                expect(ss.handleControlKey('3')).toBe(false);
                ss.selectCell(id, 1, 0);
                expect(ss.handleControlKey('3')).toBe(false);
            });

            it('ticks checkboxes with Space', () => {
                makeCheckbox(0, 0, '');
                selectColumnA(1);
                expect(ss.handleControlKey(' ')).toBe(true);
                expect(ss.findCell(id, 0, 0)?.value).toBe(true);
            });

            it('leaves a digit to be typed on a checkbox', () => {
                makeCheckbox(0, 0, '');
                selectColumnA(1);
                expect(ss.handleControlKey('1')).toBe(false);
            });
        });
    });
});
