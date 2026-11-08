import { describe, it, expect, beforeEach } from 'vitest';

import { dateToSerial, formatDate } from '@/renderer/composables/spreadsheet/engine/dates';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('cells', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0]!.id;
    });

    describe('findCell', () => {
        it('returns the cell at a coordinate', () => {
            ss.setCellValue(id, 1, 2, 'hi');
            expect(ss.findCell(id, 1, 2)?.value).toBe('hi');
        });

        it('returns null outside the grid', () => {
            expect(ss.findCell(id, 99, 0)).toBeNull();
            expect(ss.findCell(id, 0, 99)).toBeNull();
            expect(ss.findCell(id, -1, 0)).toBeNull();
            expect(ss.findCell(id, 0, -1)).toBeNull();
        });

        it('returns null for an unknown table', () => {
            expect(ss.findCell('nope', 0, 0)).toBeNull();
        });
    });

    describe('setCellValue', () => {
        it('grows the table to reach a row beyond the end', () => {
            ss.setCellValue(id, 0, 20, 'far');
            expect(ss.tables.value[0]!.rows).toHaveLength(21);
            expect(ss.getDisplayValue(id, 0, 20)).toBe('far');
        });

        it('grows the table to reach a column beyond the end', () => {
            ss.setCellValue(id, 9, 0, 'far');
            expect(ss.tables.value[0]!.columns).toHaveLength(10);
            expect(ss.getDisplayValue(id, 9, 0)).toBe('far');
        });

        it('stores a leading = as a formula, not a value', () => {
            ss.setCellValue(id, 0, 0, '=1+1');
            const cell = ss.findCell(id, 0, 0);
            expect(cell?.formula).toBe('1+1');
            expect(ss.getRawValue(id, 0, 0)).toBe('=1+1');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('2');
        });

        it('clears a formula when the cell is overwritten with a literal', () => {
            ss.setCellValue(id, 0, 0, '=1+1');
            ss.setCellValue(id, 0, 0, '7');
            expect(ss.findCell(id, 0, 0)?.formula).toBeUndefined();
            expect(ss.getDisplayValue(id, 0, 0)).toBe('7');
        });

        it('empties a cell written with the empty string', () => {
            ss.setCellValue(id, 0, 0, 'x');
            ss.setCellValue(id, 0, 0, '');
            expect(ss.findCell(id, 0, 0)?.value).toBeNull();
            expect(ss.getCellType(id, 0, 0)).toBe('empty');
        });

        it('ignores an unknown table', () => {
            ss.setCellValue('nope', 0, 0, 'x');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('');
        });
    });

    describe('type detection', () => {
        it.each([
            ['42', 'integer'],
            ['3.5', 'float'],
            ['50%', 'percent'],
            ['$9', 'currency_usd'],
            ['hello', 'text'],
            ['true', 'boolean'],
            ['https://example.com', 'url'],
            ['2026-03-04', 'date'],
        ])('detects %s as %s', (raw, expected) => {
            ss.setCellValue(id, 0, 0, raw);
            expect(ss.getCellType(id, 0, 0)).toBe(expected);
        });

        it('reports empty for an untouched cell', () => {
            expect(ss.getCellType(id, 0, 0)).toBe('empty');
        });

        it('reports empty for an unknown table', () => {
            expect(ss.getCellType('nope', 0, 0)).toBe('empty');
        });

        /**
         * Records what actually happens, and it is not what setCellValue reads
         * like. detectType('TRUE') returns type 'boolean' WITH numericValue 1,
         * and the numeric branch is tested first — so the 'boolean' branch below
         * it never runs and the cell stores 1. Display is unaffected
         * (formatCellDisplay renders a boolean-typed 1 as TRUE), but the raw
         * value the formula bar shows is '1'.
         */
        it('stores a boolean as its numeric form', () => {
            ss.setCellValue(id, 0, 0, 'TRUE');
            expect(ss.findCell(id, 0, 0)?.value).toBe(1);
            expect(ss.getCellType(id, 0, 0)).toBe('boolean');
            expect(ss.getDisplayValue(id, 0, 0)).toBe('TRUE');
            expect(ss.getRawValue(id, 0, 0)).toBe('1');
        });
    });

    describe('dates', () => {
        const march4 = dateToSerial(2026, 3, 4);

        it('stores a typed date as its serial and shows it as a date', () => {
            ss.setCellValue(id, 0, 0, '2026-03-04');
            expect(ss.findCell(id, 0, 0)?.value).toBe(march4);
            expect(ss.getDisplayValue(id, 0, 0)).toBe(formatDate(march4));
        });

        it('edits as a date and reads the same date back when committed unchanged', () => {
            ss.setCellValue(id, 0, 0, '2026-03-04');
            const raw = ss.getRawValue(id, 0, 0);
            expect(raw).toBe(formatDate(march4));
            ss.setCellValue(id, 0, 0, raw);
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: march4, cellType: 'date' });
        });

        it('turns a number into the date it counts to when retyped as a date', () => {
            ss.setCellValue(id, 0, 0, String(march4));
            ss.setCellType(id, 0, 0, 'date');
            expect(ss.getDisplayValue(id, 0, 0)).toBe(formatDate(march4));
        });

        it('counts the days between two date cells', () => {
            ss.setCellValue(id, 0, 0, '2026-03-04');
            ss.setCellValue(id, 0, 1, '2026-04-04');
            ss.setCellValue(id, 0, 2, '=A2-A1');
            expect(ss.getDisplayValue(id, 0, 2)).toBe('31');
            expect(ss.getCellType(id, 0, 2)).toBe('integer');
        });
    });

    describe('alignment', () => {
        it('right-aligns numbers and left-aligns text by default', () => {
            ss.setCellValue(id, 0, 0, '5');
            ss.setCellValue(id, 1, 0, 'five');
            expect(ss.getCellAlignment(id, 0, 0)).toBe('right');
            expect(ss.getCellAlignment(id, 1, 0)).toBe('left');
        });

        it('lets an explicit format win', () => {
            ss.setCellValue(id, 0, 0, '5');
            ss.setCellFormat(id, 0, 0, { align: 'center' });
            expect(ss.getCellAlignment(id, 0, 0)).toBe('center');
        });

        it('falls back to left for an unknown table', () => {
            expect(ss.getCellAlignment('nope', 0, 0)).toBe('left');
        });
    });

    describe('setCellType', () => {
        it('rounds a float when retyped as an integer', () => {
            ss.setCellValue(id, 0, 0, '3.7');
            ss.setCellType(id, 0, 0, 'integer');
            expect(ss.findCell(id, 0, 0)?.value).toBe(4);
        });

        it('retypes the computed type of a formula cell', () => {
            ss.setCellValue(id, 0, 0, '=1+1');
            ss.setCellType(id, 0, 0, 'currency_usd');
            expect(ss.getCellType(id, 0, 0)).toBe('currency_usd');
        });

        it('ignores an unknown cell', () => {
            ss.setCellType(id, 99, 99, 'text');
            expect(ss.getCellType(id, 0, 0)).toBe('empty');
        });

        it('reads a date out of text retyped as a date', () => {
            ss.setCellValue(id, 0, 0, '2026-03-04');
            ss.setCellType(id, 0, 0, 'text');
            ss.setCellType(id, 0, 0, 'date');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: dateToSerial(2026, 3, 4), cellType: 'date' });
        });

        it('leaves text with no number in it as text when given a numeric type', () => {
            ss.setCellValue(id, 0, 0, 'Due');
            ss.setCellType(id, 0, 0, 'date');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 'Due', cellType: 'text' });
        });

        it('leaves an empty cell empty', () => {
            ss.setCellType(id, 0, 0, 'date');
            expect(ss.getCellType(id, 0, 0)).toBe('empty');
        });
    });

    describe('setSelectionType', () => {
        it('retypes every cell in the selection', () => {
            ss.setCellValue(id, 0, 0, '46085');
            ss.setCellValue(id, 0, 1, '46086');
            ss.setCellValue(id, 1, 0, '7');
            ss.setCellValue(id, 0, 2, '46087');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 0, 1);
            ss.setSelectionType('date');
            expect(ss.getCellType(id, 0, 0)).toBe('date');
            expect(ss.getCellType(id, 0, 1)).toBe('date');
            expect(ss.getCellType(id, 1, 0)).toBe('integer');
            expect(ss.getCellType(id, 0, 2)).toBe('integer');
        });

        it('retypes the active cell when nothing is ranged', () => {
            ss.setCellValue(id, 0, 0, '5');
            ss.selectCell(id, 0, 0);
            ss.setSelectionType('percent');
            expect(ss.getCellType(id, 0, 0)).toBe('percent');
        });

        it('keeps a header row as text while the dates under it become dates', () => {
            ss.setCellValue(id, 0, 0, 'Due');
            ss.setCellValue(id, 0, 1, '2026-03-04');
            ss.setCellType(id, 0, 1, 'text');
            ss.setCellValue(id, 0, 2, '5');
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 0, 2);
            ss.setSelectionType('date');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 'Due', cellType: 'text' });
            expect(ss.findCell(id, 0, 1)).toMatchObject({ value: dateToSerial(2026, 3, 4), cellType: 'date' });
            expect(ss.findCell(id, 0, 2)).toMatchObject({ value: 5, cellType: 'date' });
        });

        it('recalculates formulas that read the retyped cells', () => {
            ss.setCellValue(id, 0, 0, '46085');
            ss.setCellValue(id, 1, 0, '=A1+7');
            ss.selectCell(id, 0, 0);
            ss.setSelectionType('date');
            expect(ss.getCellType(id, 1, 0)).toBe('date');
        });

        it('undoes in one step', async () => {
            ss.setCellValue(id, 0, 0, '1');
            ss.setCellValue(id, 0, 1, '2');
            await Promise.resolve();
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 0, 1);
            ss.setSelectionType('currency_usd');
            ss.undo();
            expect(ss.getCellType(id, 0, 0)).toBe('integer');
            expect(ss.getCellType(id, 0, 1)).toBe('integer');
        });
    });

    describe('formats', () => {
        it('merges a partial format into the cell', () => {
            ss.setCellFormat(id, 0, 0, { bold: true });
            ss.setCellFormat(id, 0, 0, { italic: true });
            expect(ss.findCell(id, 0, 0)?.format).toMatchObject({ bold: true, italic: true });
        });

        it('applies a format across the whole selection', () => {
            ss.selectCell(id, 0, 0);
            ss.extendSelection(id, 1, 1);
            ss.setSelectionFormat({ bold: true });
            expect(ss.findCell(id, 1, 1)?.format?.bold).toBe(true);
            expect(ss.findCell(id, 2, 2)?.format?.bold).toBeUndefined();
        });

        it('applies a format to the active cell when nothing is ranged', () => {
            ss.selectCell(id, 2, 2);
            ss.setSelectionFormat({ bold: true });
            expect(ss.findCell(id, 2, 2)?.format?.bold).toBe(true);
        });

        it('does nothing with no active cell', () => {
            ss.setSelectionFormat({ bold: true });
            expect(ss.findCell(id, 0, 0)?.format).toBeUndefined();
        });

        it('reads back the active cell format', () => {
            ss.selectCell(id, 0, 0);
            ss.setSelectionFormat({ bold: true });
            expect(ss.findActiveCellFormat()).toMatchObject({ bold: true });
        });

        it('returns null for the active format with no active cell', () => {
            expect(ss.findActiveCellFormat()).toBeNull();
        });

        it('formats a number to the requested decimal places', () => {
            ss.setCellValue(id, 0, 0, '3.14159');
            ss.setCellFormat(id, 0, 0, { decimalPlaces: 2 });
            expect(ss.getDisplayValue(id, 0, 0)).toBe('3.14');
        });
    });

    describe('notes', () => {
        it('stores and reads a note', () => {
            ss.setCellNote(id, 0, 0, 'check this');
            expect(ss.getCellNote(id, 0, 0)).toBe('check this');
            expect(ss.cellHasNote(id, 0, 0)).toBe(true);
        });

        it('reports no note on an untouched cell', () => {
            expect(ss.getCellNote(id, 0, 0)).toBe('');
            expect(ss.cellHasNote(id, 0, 0)).toBe(false);
        });

        it('removes a note', () => {
            ss.setCellNote(id, 0, 0, 'x');
            ss.removeCellNote(id, 0, 0);
            expect(ss.cellHasNote(id, 0, 0)).toBe(false);
        });

        it('treats an empty note as no note', () => {
            ss.setCellNote(id, 0, 0, '');
            expect(ss.cellHasNote(id, 0, 0)).toBe(false);
        });

        it('ignores notes on an unknown cell', () => {
            ss.setCellNote(id, 99, 99, 'x');
            ss.removeCellNote(id, 99, 99);
            expect(ss.getCellNote(id, 99, 99)).toBe('');
            expect(ss.cellHasNote(id, 99, 99)).toBe(false);
        });
    });

    describe('display values', () => {
        it('returns the empty string outside the grid', () => {
            expect(ss.getDisplayValue(id, 99, 99)).toBe('');
            expect(ss.getRawValue(id, 99, 99)).toBe('');
        });

        it('passes an error code through unformatted', () => {
            ss.setCellValue(id, 0, 0, '=1/0');
            expect(ss.getDisplayValue(id, 0, 0)).toMatch(/^#/);
        });
    });

    describe('checkboxes', () => {
        function makeCheckbox(col: number, row: number, raw: string): void {
            ss.setCellValue(id, col, row, raw);
            ss.setCellType(id, col, row, 'checkbox');
        }

        it.each([
            ['true', true],
            ['1', true],
            ['5', true],
            ['$2', true],
            ['false', false],
            ['0', false],
        ])('makes %s a checkbox ticked: %s', (raw, checked) => {
            makeCheckbox(0, 0, raw);
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: checked, cellType: 'checkbox' });
        });

        it('makes an empty cell an unticked box', () => {
            makeCheckbox(0, 0, '');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: null, cellType: 'checkbox' });
        });

        it('leaves other text as text', () => {
            makeCheckbox(0, 0, 'Buy milk');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 'Buy milk', cellType: 'text' });
        });

        it('takes the box away from an empty checkbox given another type', () => {
            makeCheckbox(0, 0, '');
            ss.setCellType(id, 0, 0, 'text');
            expect(ss.getCellType(id, 0, 0)).toBe('empty');
        });

        it.each([
            ['integer', 1, '1'],
            ['currency_usd', 1, '$1.00'],
            ['text', 'TRUE', 'TRUE'],
        ] as const)('turns a ticked box into %s', (type, value, display) => {
            makeCheckbox(0, 0, 'true');
            ss.setCellType(id, 0, 0, type);
            expect(ss.findCell(id, 0, 0)?.value).toBe(value);
            expect(ss.getDisplayValue(id, 0, 0)).toBe(display);
        });

        it('stays a checkbox when TRUE or FALSE is typed into it', () => {
            makeCheckbox(0, 0, '');
            ss.setCellValue(id, 0, 0, 'TRUE');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: true, cellType: 'checkbox' });
            ss.setCellValue(id, 0, 0, 'false');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: false, cellType: 'checkbox' });
        });

        it('unticks rather than disappears when cleared', () => {
            makeCheckbox(0, 0, 'true');
            ss.setCellValue(id, 0, 0, '');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: null, cellType: 'checkbox' });
        });

        it('becomes whatever else is typed into it', () => {
            makeCheckbox(0, 0, 'true');
            ss.setCellValue(id, 0, 0, 'Done');
            expect(ss.findCell(id, 0, 0)).toMatchObject({ value: 'Done', cellType: 'text' });
        });

        it('edits as TRUE or FALSE', () => {
            makeCheckbox(0, 0, '1');
            expect(ss.getRawValue(id, 0, 0)).toBe('TRUE');
            ss.toggleCheckbox(id, 0, 0);
            expect(ss.getRawValue(id, 0, 0)).toBe('FALSE');
        });

        it('a typed TRUE stays a plain TRUE, not a checkbox', () => {
            ss.setCellValue(id, 0, 0, 'TRUE');
            expect(ss.getCellType(id, 0, 0)).toBe('boolean');
        });

        describe('in formulas', () => {
            it('reads as TRUE or FALSE', () => {
                makeCheckbox(0, 0, 'true');
                ss.setCellValue(id, 1, 0, '=AND(A1, NOT(FALSE))');
                ss.setCellValue(id, 2, 0, '=A1');
                expect(ss.getDisplayValue(id, 1, 0)).toBe('TRUE');
                expect(ss.getCellType(id, 2, 0)).toBe('boolean');
            });

            it('counts as 1 when ticked in arithmetic', () => {
                makeCheckbox(0, 0, 'true');
                ss.setCellValue(id, 1, 0, '=A1+1');
                expect(ss.getDisplayValue(id, 1, 0)).toBe('2');
            });
        });
    });
});
