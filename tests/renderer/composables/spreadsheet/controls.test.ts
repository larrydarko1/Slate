import { assert, describe, it, expect, beforeEach } from 'vitest';

import { findLimitsProblem } from '@/renderer/composables/spreadsheet/controls';
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

    function makeStepper(col: number, row: number, raw: string): void {
        ss.setCellValue(id, col, row, raw);
        ss.setCellType(id, col, row, 'stepper');
    }

    function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
        return new KeyboardEvent('keydown', { key, ...init });
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
                ['TRUE', 1, 'boolean'],
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
                expect(ss.handleControlKey(press('4'))).toBe(true);
                expect([0, 1, 2].map((r) => ss.findCell(id, 0, r)?.value)).toEqual([4, 4, 'note']);
            });

            it('clears the ratings with 0, and sets the same digit twice without clearing', () => {
                makeRating(0, 0, '3');
                selectColumnA(1);
                ss.handleControlKey(press('3'));
                expect(ss.findCell(id, 0, 0)?.value).toBe(3);
                ss.handleControlKey(press('0'));
                expect(ss.findCell(id, 0, 0)?.value).toBeNull();
            });

            it.each([['6'], ['9'], [' '], ['a']])('leaves %j to be typed on a rating', (key) => {
                makeRating(0, 0, '2');
                selectColumnA(1);
                expect(ss.handleControlKey(press(key))).toBe(false);
                expect(ss.findCell(id, 0, 0)?.value).toBe(2);
            });

            it('leaves a digit to be typed on a formula rating or an ordinary cell', () => {
                ss.setCellValue(id, 0, 0, '=1+1');
                ss.setCellType(id, 0, 0, 'rating');
                ss.selectCell(id, 0, 0);
                expect(ss.handleControlKey(press('3'))).toBe(false);
                ss.selectCell(id, 1, 0);
                expect(ss.handleControlKey(press('3'))).toBe(false);
            });

            it('ticks checkboxes with Space', () => {
                makeCheckbox(0, 0, '');
                selectColumnA(1);
                expect(ss.handleControlKey(press(' '))).toBe(true);
                expect(ss.findCell(id, 0, 0)?.value).toBe(true);
            });

            it('leaves a digit to be typed on a checkbox', () => {
                makeCheckbox(0, 0, '');
                selectColumnA(1);
                expect(ss.handleControlKey(press('1'))).toBe(false);
            });
        });
    });
    describe('steppers', () => {
        function setLimits(col: number, row: number, min: number, max: number, step: number): void {
            const cell = ss.findCell(id, col, row);
            assert.isNotNull(cell);
            cell.limits = { min, max, step };
        }

        describe('typing', () => {
            it.each([
                ['42', 42],
                ['0', 0],
                ['100', 100],
                ['7.3', 7.3],
            ])('keeps %j, which is within the limits', (raw, value) => {
                makeStepper(0, 0, '');
                ss.setCellValue(id, 0, 0, raw);
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value, cellType: 'stepper' });
            });

            it.each([
                ['150', 150, 'integer'],
                ['-1', -1, 'integer'],
                ['$5', 5, 'currency_usd'],
                ['50%', 0.5, 'percent'],
                ['TRUE', 1, 'boolean'],
                ['soon', 'soon', 'text'],
            ])('makes %j, which no stepper here can show, an ordinary cell', (raw, value, cellType) => {
                makeStepper(0, 0, '5');
                ss.setCellValue(id, 0, 0, raw);
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value, cellType });
            });

            it("goes by the cell's own limits", () => {
                makeStepper(0, 0, '');
                setLimits(0, 0, 10, 20, 1);
                ss.setCellValue(id, 0, 0, '5');
                expect(ss.findCell(id, 0, 0)?.cellType).toBe('integer');
                makeStepper(0, 0, '15');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 15, cellType: 'stepper' });
            });

            it('stays a stepper, empty, when cleared', () => {
                makeStepper(0, 0, '5');
                ss.setCellValue(id, 0, 0, '');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: null, cellType: 'stepper' });
            });
        });

        describe('setCellType', () => {
            it('makes a number within the limits a stepper, and an empty cell an empty one', () => {
                makeStepper(0, 0, '42');
                makeStepper(0, 1, '');
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 42, cellType: 'stepper' });
                expect(ss.findCell(id, 0, 1)).toMatchObject({ value: null, cellType: 'stepper' });
            });

            it.each([
                ['150', 150, 'integer'],
                ['TRUE', 1, 'boolean'],
                ['soon', 'soon', 'text'],
            ])('leaves %j, which has no stepper to become, as it is', (raw, value, cellType) => {
                makeStepper(0, 0, raw);
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value, cellType });
            });
        });

        describe('stepStepper', () => {
            it('moves up and down by the step', () => {
                makeStepper(0, 0, '5');
                ss.stepStepper(id, 0, 0, 1);
                expect(ss.findCell(id, 0, 0)?.value).toBe(6);
                ss.stepStepper(id, 0, 0, -1);
                ss.stepStepper(id, 0, 0, -1);
                expect(ss.findCell(id, 0, 0)?.value).toBe(4);
            });

            it.each([[1], [-1]] as const)('takes an empty stepper to its minimum, stepping %i', (direction) => {
                makeStepper(0, 0, '');
                setLimits(0, 0, 10, 20, 5);
                ss.stepStepper(id, 0, 0, direction);
                expect(ss.findCell(id, 0, 0)?.value).toBe(10);
            });

            it('stops at the limits rather than passing them', () => {
                makeStepper(0, 0, '18');
                setLimits(0, 0, 10, 20, 5);
                ss.stepStepper(id, 0, 0, 1);
                expect(ss.findCell(id, 0, 0)?.value).toBe(20);
                ss.stepStepper(id, 0, 0, 1);
                expect(ss.findCell(id, 0, 0)?.value).toBe(20);
                makeStepper(0, 0, '12');
                ss.stepStepper(id, 0, 0, -1);
                expect(ss.findCell(id, 0, 0)?.value).toBe(10);
            });

            it('adds a decimal step without a rounding error', () => {
                makeStepper(0, 0, '');
                setLimits(0, 0, 0, 1, 0.1);
                ss.setCellValue(id, 0, 0, '0.2');
                ss.stepStepper(id, 0, 0, 1);
                expect(ss.findCell(id, 0, 0)?.value).toBe(0.3);
            });

            it('moves a value off the step by the step, without snapping it', () => {
                makeStepper(0, 0, '7.3');
                ss.stepStepper(id, 0, 0, 1);
                expect(ss.findCell(id, 0, 0)?.value).toBe(8.3);
            });

            it('undoes', async () => {
                makeStepper(0, 0, '5');
                await Promise.resolve();
                ss.stepStepper(id, 0, 0, 1);
                ss.undo();
                expect(ss.findCell(id, 0, 0)?.value).toBe(5);
            });

            it('adds nothing to undo when already at the limit', async () => {
                makeStepper(0, 0, '1');
                await Promise.resolve();
                ss.setCellValue(id, 0, 0, '100');
                await Promise.resolve();
                ss.stepStepper(id, 0, 0, 1);
                ss.undo();
                expect(ss.findCell(id, 0, 0)?.value).toBe(1);
            });

            it('recalculates formulas that read the stepper', () => {
                makeStepper(0, 0, '5');
                ss.setCellValue(id, 1, 0, '=A1*2');
                ss.stepStepper(id, 0, 0, 1);
                expect(ss.getDisplayValue(id, 1, 0)).toBe('12');
            });

            it('leaves a formula stepper and an ordinary cell alone', () => {
                ss.setCellValue(id, 0, 0, '=1+1');
                ss.setCellType(id, 0, 0, 'stepper');
                ss.setCellValue(id, 0, 1, '5');
                ss.stepStepper(id, 0, 0, 1);
                ss.stepStepper(id, 0, 1, 1);
                expect(ss.findCell(id, 0, 0)?.computed).toBe(2);
                expect(ss.findCell(id, 0, 1)?.value).toBe(5);
            });
        });

        describe('handleControlKey', () => {
            it('steps every stepper in the selection with Alt+Up, each by its own limits', () => {
                makeStepper(0, 0, '5');
                makeStepper(0, 1, '20');
                setLimits(0, 1, 0, 20, 5);
                makeStepper(0, 2, '');
                ss.setCellValue(id, 0, 3, '5');
                selectColumnA(4);
                expect(ss.handleControlKey(press('ArrowUp', { altKey: true }))).toBe(true);
                expect([0, 1, 2, 3].map((r) => ss.findCell(id, 0, r)?.value)).toEqual([6, 20, 0, 5]);
            });

            it('steps down with Alt+Down', () => {
                makeStepper(0, 0, '5');
                selectColumnA(1);
                expect(ss.handleControlKey(press('ArrowDown', { altKey: true }))).toBe(true);
                expect(ss.findCell(id, 0, 0)?.value).toBe(4);
            });

            it.each([
                ['ArrowUp', {}],
                ['3', {}],
                ['ArrowLeft', { altKey: true }],
            ])('leaves %j to move or type on a stepper', (key, init) => {
                makeStepper(0, 0, '5');
                selectColumnA(1);
                expect(ss.handleControlKey(press(key, init))).toBe(false);
                expect(ss.findCell(id, 0, 0)?.value).toBe(5);
            });

            it('leaves Alt+Up to move on a formula stepper', () => {
                ss.setCellValue(id, 0, 0, '=1+1');
                ss.setCellType(id, 0, 0, 'stepper');
                ss.selectCell(id, 0, 0);
                expect(ss.handleControlKey(press('ArrowUp', { altKey: true }))).toBe(false);
            });
        });

        describe('in formulas', () => {
            it.each([
                ['42', '42'],
                ['2.5', '2.5'],
            ])('reads %j as the number it holds', (raw, shown) => {
                makeStepper(0, 0, raw);
                ss.setCellValue(id, 1, 0, '=A1');
                expect(ss.getDisplayValue(id, 1, 0)).toBe(shown);
            });

            it('adds steppers up, skipping an empty one in AVERAGE', () => {
                makeStepper(0, 0, '4');
                makeStepper(0, 1, '5');
                makeStepper(0, 2, '');
                ss.setCellValue(id, 1, 0, '=SUM(A1:A3)');
                ss.setCellValue(id, 1, 1, '=AVERAGE(A1:A3)');
                expect(ss.getDisplayValue(id, 1, 0)).toBe('9');
                expect(ss.getDisplayValue(id, 1, 1)).toBe('4.5');
            });
        });

        describe('findActiveLimits', () => {
            it("gives a stepper's own limits, or the defaults when it has none", () => {
                makeStepper(0, 0, '5');
                makeStepper(0, 1, '15');
                setLimits(0, 1, 10, 20, 5);
                ss.selectCell(id, 0, 0);
                expect(ss.findActiveLimits()).toEqual({ min: 0, max: 100, step: 1 });
                ss.selectCell(id, 0, 1);
                expect(ss.findActiveLimits()).toEqual({ min: 10, max: 20, step: 5 });
            });

            it('gives none for an ordinary cell or a formula stepper', () => {
                ss.setCellValue(id, 0, 0, '5');
                ss.setCellValue(id, 0, 1, '=2+3');
                ss.setCellType(id, 0, 1, 'stepper');
                ss.selectCell(id, 0, 0);
                expect(ss.findActiveLimits()).toBeNull();
                ss.selectCell(id, 0, 1);
                expect(ss.findActiveLimits()).toBeNull();
            });
        });

        describe('setSelectionLimits', () => {
            it('gives every stepper in the selection the limits, and nothing else', () => {
                makeStepper(0, 0, '5');
                makeStepper(0, 1, '');
                ss.setCellValue(id, 0, 2, '5');
                selectColumnA(3);
                ss.setSelectionLimits({ min: 0, max: 10, step: 2 });
                expect([0, 1, 2].map((r) => ss.findCell(id, 0, r)?.limits)).toEqual([
                    { min: 0, max: 10, step: 2 },
                    { min: 0, max: 10, step: 2 },
                    undefined,
                ]);
            });

            it('moves a value the new limits leave out to the nearer end', () => {
                makeStepper(0, 0, '80');
                makeStepper(0, 1, '2');
                makeStepper(0, 2, '30');
                makeStepper(0, 3, '');
                selectColumnA(4);
                ss.setSelectionLimits({ min: 10, max: 50, step: 1 });
                expect([0, 1, 2, 3].map((r) => ss.findCell(id, 0, r)?.value)).toEqual([50, 10, 30, null]);
            });

            it('recalculates formulas that read a moved value', () => {
                makeStepper(0, 0, '80');
                ss.setCellValue(id, 1, 0, '=A1');
                ss.selectCell(id, 0, 0);
                ss.setSelectionLimits({ min: 0, max: 50, step: 1 });
                expect(ss.getDisplayValue(id, 1, 0)).toBe('50');
            });

            it('undoes the limits and the moved values in one step', async () => {
                makeStepper(0, 0, '80');
                ss.selectCell(id, 0, 0);
                await Promise.resolve();
                ss.setSelectionLimits({ min: 0, max: 50, step: 1 });
                ss.undo();
                expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 80 });
                expect(ss.findCell(id, 0, 0)?.limits).toBeUndefined();
            });

            it('refuses limits a stepper cannot use', () => {
                makeStepper(0, 0, '5');
                ss.selectCell(id, 0, 0);
                expect(() => ss.setSelectionLimits({ min: 10, max: 0, step: 1 })).toThrow(
                    'Stepper limits refused: Must be more than the minimum',
                );
                expect(ss.findCell(id, 0, 0)?.limits).toBeUndefined();
            });
        });

        describe('findLimitsProblem', () => {
            it.each([[{ min: 0, max: 100, step: 1 }], [{ min: -5, max: 5, step: 0.5 }], [{ min: 0, max: 1, step: 5 }]])(
                'accepts %j',
                (limits) => {
                    expect(findLimitsProblem(limits)).toBeNull();
                },
            );

            it.each([
                [{ min: Number.NaN, max: 10, step: 1 }, 'min', 'Enter a number'],
                [{ min: 0, max: Number.POSITIVE_INFINITY, step: 1 }, 'max', 'Enter a number'],
                [{ min: 10, max: 10, step: 1 }, 'max', 'Must be more than the minimum'],
                [{ min: 10, max: 0, step: 1 }, 'max', 'Must be more than the minimum'],
                [{ min: 0, max: 10, step: 0 }, 'step', 'Must be more than 0'],
                [{ min: 0, max: 10, step: -1 }, 'step', 'Must be more than 0'],
            ])('refuses %j, naming its %s', (limits, field, message) => {
                expect(findLimitsProblem(limits)).toEqual({ field, message });
            });
        });

        it('keeps its limits through undo', async () => {
            makeStepper(0, 0, '15');
            setLimits(0, 0, 10, 20, 5);
            await Promise.resolve();
            ss.stepStepper(id, 0, 0, 1);
            ss.undo();
            expect(ss.findCell(id, 0, 0)?.limits).toEqual({ min: 10, max: 20, step: 5 });
        });
    });
});
