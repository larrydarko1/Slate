import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('cells', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
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
            expect(ss.tables.value[0].rows.length).toBe(21);
            expect(ss.getDisplayValue(id, 0, 20)).toBe('far');
        });

        it('grows the table to reach a column beyond the end', () => {
            ss.setCellValue(id, 9, 0, 'far');
            expect(ss.tables.value[0].columns.length).toBe(10);
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
});
