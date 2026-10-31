import { describe, it, expect } from 'vitest';

import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import { dateToSerial } from '@/renderer/composables/spreadsheet/engine/dates';
import { evaluateFormulaTyped, type FormulaContext } from '@/renderer/composables/spreadsheet/engine/formula';
import type { CellValue } from '@/renderer/types/spreadsheet';

/** The context every case that reads no cell shares. */
const emptyCtx = gridContext([]);

/** The value half of a typed evaluation — what most of these cases assert on. */
const evaluateFormula = (formulaBody: string, ctx: FormulaContext): CellValue =>
    evaluateFormulaTyped(formulaBody, ctx).value;

/** Build a simple grid-backed FormulaContext from a 2D array of values. */
function gridContext(grid: CellValue[][], types?: CellDataType[][]): FormulaContext {
    const getVal = (col: number, row: number): CellValue => grid[row]?.[col] ?? null;
    const getType = (col: number, row: number): CellDataType => types?.[row]?.[col] ?? 'integer';

    return {
        getCellValue: getVal,
        getCellType: getType,
        getCellRange: (sc, sr, ec, er) => {
            const result: CellValue[] = [];
            for (let r = sr; r <= er; r++) {
                for (let c = sc; c <= ec; c++) {
                    result.push(getVal(c, r));
                }
            }
            return result;
        },
        getCellRangeTypes: (sc, sr, ec, er) => {
            const result: CellDataType[] = [];
            for (let r = sr; r <= er; r++) {
                for (let c = sc; c <= ec; c++) {
                    result.push(getType(c, r));
                }
            }
            return result;
        },
    };
}

// ── Error literals ───────────────────────────────────────────────────────────

describe('#REF!', () => {
    it('evaluates to itself', () => {
        expect(evaluateFormula('#REF!', emptyCtx)).toBe('#REF!');
    });

    it('propagates through arithmetic and functions', () => {
        expect(evaluateFormula('#REF!*2', emptyCtx)).toBe('#REF!');
        expect(evaluateFormula('SUM(1,#REF!)', emptyCtx)).toBe('#REF!');
    });
});

// ── Dates ────────────────────────────────────────────────────────────────────

describe('dates', () => {
    const march4 = dateToSerial(2026, 3, 4);
    const dates = gridContext([[march4, dateToSerial(2026, 3, 1)]], [['date', 'date']]);

    it('moves a date by a number of days and keeps it a date', () => {
        expect(evaluateFormulaTyped('A1+7', dates)).toEqual({ value: march4 + 7, type: 'date' });
        expect(evaluateFormulaTyped('A1-1', dates)).toEqual({ value: march4 - 1, type: 'date' });
    });

    it('counts the days between two dates', () => {
        expect(evaluateFormulaTyped('A1-B1', dates)).toEqual({ value: 3, type: 'integer' });
    });

    it('builds a date with DATE, rolling over out-of-range parts', () => {
        expect(evaluateFormulaTyped('DATE(2026,3,4)', emptyCtx)).toEqual({ value: march4, type: 'date' });
        expect(evaluateFormula('DATE(2026,13,1)', emptyCtx)).toBe(dateToSerial(2027, 1, 1));
        expect(evaluateFormula('DATE(2026,3)', emptyCtx)).toBe('#VALUE!');
    });

    it('takes a date apart with YEAR, MONTH and DAY', () => {
        expect(evaluateFormulaTyped('YEAR(A1)', dates)).toEqual({ value: 2026, type: 'integer' });
        expect(evaluateFormula('MONTH(A1)', dates)).toBe(3);
        expect(evaluateFormula('DAY(A1)', dates)).toBe(4);
    });

    it('reads a typed date in a string', () => {
        expect(evaluateFormula('YEAR("2026-03-04")', emptyCtx)).toBe(2026);
    });

    it('rejects what is not a date and passes errors on', () => {
        expect(evaluateFormula('DAY("soon")', emptyCtx)).toBe('#VALUE!');
        expect(evaluateFormula('MONTH(#REF!)', emptyCtx)).toBe('#REF!');
        expect(evaluateFormula('DATE(2026,#REF!,1)', emptyCtx)).toBe('#REF!');
    });

    it('finds the latest of several dates and keeps it a date', () => {
        expect(evaluateFormulaTyped('MAX(A1:B1)', dates)).toEqual({ value: march4, type: 'date' });
    });
});

// ── Arithmetic ───────────────────────────────────────────────────────────────

describe('arithmetic', () => {
    it('evaluates addition', () => {
        expect(evaluateFormula('1 + 2', emptyCtx)).toBe(3);
    });

    it('evaluates subtraction', () => {
        expect(evaluateFormula('10 - 3', emptyCtx)).toBe(7);
    });

    it('evaluates multiplication', () => {
        expect(evaluateFormula('4 * 5', emptyCtx)).toBe(20);
    });

    it('evaluates division', () => {
        expect(evaluateFormula('20 / 4', emptyCtx)).toBe(5);
    });

    it('returns #DIV/0! for division by zero', () => {
        expect(evaluateFormula('1 / 0', emptyCtx)).toBe('#DIV/0!');
    });

    it('evaluates exponentiation', () => {
        expect(evaluateFormula('2 ^ 3', emptyCtx)).toBe(8);
    });

    it('respects operator precedence', () => {
        expect(evaluateFormula('2 + 3 * 4', emptyCtx)).toBe(14);
    });

    it('respects parentheses', () => {
        expect(evaluateFormula('(2 + 3) * 4', emptyCtx)).toBe(20);
    });

    it('handles unary minus', () => {
        expect(evaluateFormula('-5 + 3', emptyCtx)).toBe(-2);
    });

    it('handles nested parentheses', () => {
        expect(evaluateFormula('((1 + 2) * (3 + 4))', emptyCtx)).toBe(21);
    });
});

// ── Comparison ───────────────────────────────────────────────────────────────

describe('comparison', () => {
    it.each([
        ['1 = 1', true],
        ['1 = 2', false],
        ['1 <> 2', true],
        ['1 <> 1', false],
        ['1 < 2', true],
        ['2 < 1', false],
        ['2 > 1', true],
        ['1 > 2', false],
        ['1 <= 1', true],
        ['1 <= 2', true],
        ['2 >= 2', true],
        ['2 >= 3', false],
    ])('evaluates %s → %s', (formula, expected) => {
        expect(evaluateFormula(formula, emptyCtx)).toBe(expected);
    });
});

// ── Concatenation ────────────────────────────────────────────────────────────

describe('concatenation', () => {
    it('concatenates strings with &', () => {
        expect(evaluateFormula('"Hello" & " " & "World"', emptyCtx)).toBe('Hello World');
    });

    it('concatenates numbers as strings', () => {
        expect(evaluateFormula('1 & 2', emptyCtx)).toBe('12');
    });
});

// ── String literals ──────────────────────────────────────────────────────────

describe('strings', () => {
    it('evaluates a string literal', () => {
        expect(evaluateFormula('"hello"', emptyCtx)).toBe('hello');
    });

    it('evaluates an empty string', () => {
        expect(evaluateFormula('""', emptyCtx)).toBe('');
    });
});

// ── Boolean literals ─────────────────────────────────────────────────────────

describe('boolean literals', () => {
    it('evaluates TRUE', () => {
        expect(evaluateFormula('TRUE', emptyCtx)).toBe(true);
    });

    it('evaluates FALSE', () => {
        expect(evaluateFormula('FALSE', emptyCtx)).toBe(false);
    });
});

// ── Cell references ──────────────────────────────────────────────────────────

describe('cell references', () => {
    const ctx = gridContext([
        [10, 20, 30],
        [40, 50, 60],
    ]);

    it('resolves a single cell reference', () => {
        expect(evaluateFormula('A1', ctx)).toBe(10);
        expect(evaluateFormula('B1', ctx)).toBe(20);
        expect(evaluateFormula('A2', ctx)).toBe(40);
    });

    it('uses cell references in arithmetic', () => {
        expect(evaluateFormula('A1 + B1', ctx)).toBe(30);
    });

    it('returns null for an empty cell', () => {
        const result = evaluateFormula('D1', ctx);
        expect(result === null || result === 0).toBe(true);
    });
});

// ── Functions: math ──────────────────────────────────────────────────────────

describe('math functions', () => {
    const ctx = gridContext([
        [10, 20, 30],
        [40, 50, 60],
    ]);

    it('SUM of a range', () => {
        expect(evaluateFormula('SUM(A1:C1)', ctx)).toBe(60);
    });

    it('SUM of a 2D range', () => {
        expect(evaluateFormula('SUM(A1:C2)', ctx)).toBe(210);
    });

    it('AVERAGE of a range', () => {
        expect(evaluateFormula('AVERAGE(A1:C1)', ctx)).toBe(20);
    });

    it('MIN of a range', () => {
        expect(evaluateFormula('MIN(A1:C2)', ctx)).toBe(10);
    });

    it('MAX of a range', () => {
        expect(evaluateFormula('MAX(A1:C2)', ctx)).toBe(60);
    });

    it('COUNT of a range', () => {
        expect(evaluateFormula('COUNT(A1:C1)', ctx)).toBe(3);
    });

    it('ABS of a negative number', () => {
        expect(evaluateFormula('ABS(-5)', emptyCtx)).toBe(5);
    });

    it('SQRT', () => {
        expect(evaluateFormula('SQRT(16)', emptyCtx)).toBe(4);
    });

    it('POWER', () => {
        expect(evaluateFormula('POWER(2, 10)', emptyCtx)).toBe(1024);
    });

    it('MOD', () => {
        expect(evaluateFormula('MOD(10, 3)', emptyCtx)).toBe(1);
    });

    it('INT truncates', () => {
        expect(evaluateFormula('INT(3.9)', emptyCtx)).toBe(3);
    });

    it('ROUND', () => {
        expect(evaluateFormula('ROUND(3.456, 2)', emptyCtx)).toBe(3.46);
    });

    it('PI', () => {
        expect(evaluateFormula('PI()', emptyCtx)).toBeCloseTo(Math.PI);
    });
});

// ── Functions: logic ─────────────────────────────────────────────────────────

describe('logic functions', () => {
    it('IF true branch', () => {
        expect(evaluateFormula('IF(1 > 0, "yes", "no")', emptyCtx)).toBe('yes');
    });

    it('IF false branch', () => {
        expect(evaluateFormula('IF(1 > 2, "yes", "no")', emptyCtx)).toBe('no');
    });

    it('AND', () => {
        expect(evaluateFormula('AND(TRUE, TRUE)', emptyCtx)).toBe(true);
        expect(evaluateFormula('AND(TRUE, FALSE)', emptyCtx)).toBe(false);
    });

    it('OR', () => {
        expect(evaluateFormula('OR(FALSE, TRUE)', emptyCtx)).toBe(true);
        expect(evaluateFormula('OR(FALSE, FALSE)', emptyCtx)).toBe(false);
    });

    it('NOT', () => {
        expect(evaluateFormula('NOT(TRUE)', emptyCtx)).toBe(false);
        expect(evaluateFormula('NOT(FALSE)', emptyCtx)).toBe(true);
    });
});

// ── Functions: string ────────────────────────────────────────────────────────

describe('string functions', () => {
    it('UPPER', () => {
        expect(evaluateFormula('UPPER("hello")', emptyCtx)).toBe('HELLO');
    });

    it('LOWER', () => {
        expect(evaluateFormula('LOWER("HELLO")', emptyCtx)).toBe('hello');
    });

    it('LEN', () => {
        expect(evaluateFormula('LEN("hello")', emptyCtx)).toBe(5);
    });

    it('TRIM', () => {
        expect(evaluateFormula('TRIM("  hello  ")', emptyCtx)).toBe('hello');
    });

    it('LEFT', () => {
        expect(evaluateFormula('LEFT("hello", 3)', emptyCtx)).toBe('hel');
    });

    it('RIGHT', () => {
        expect(evaluateFormula('RIGHT("hello", 3)', emptyCtx)).toBe('llo');
    });

    it('MID', () => {
        expect(evaluateFormula('MID("hello", 2, 3)', emptyCtx)).toBe('ell');
    });

    it('CONCAT', () => {
        expect(evaluateFormula('CONCAT("a", "b", "c")', emptyCtx)).toBe('abc');
    });
});

// ── Type-aware evaluation ────────────────────────────────────────────────────

describe('evaluateFormulaTyped', () => {
    it('returns integer type for integer arithmetic', () => {
        const result = evaluateFormulaTyped('1 + 2', emptyCtx);
        expect(result.value).toBe(3);
        expect(result.type).toBe('integer');
    });

    it('preserves currency type from first operand', () => {
        const ctx = gridContext([[100]], [['currency_usd']]);
        const result = evaluateFormulaTyped('A1 + 50', ctx);
        expect(result.value).toBe(150);
        expect(result.type).toBe('currency_usd');
    });

    it('returns text type on error', () => {
        const result = evaluateFormulaTyped('1 / 0', emptyCtx);
        expect(result.value).toBe('#DIV/0!');
        expect(result.type).toBe('text');
    });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
    it('returns #ERROR! for invalid syntax', () => {
        const result = evaluateFormula('1 +', emptyCtx);
        expect(String(result)).toContain('#ERROR!');
    });

    it('returns #NAME? for unknown functions', () => {
        const result = evaluateFormula('NOSUCHFUNC(1)', emptyCtx);
        expect(String(result)).toContain('#NAME?');
    });

    it('returns #DIV/0! for division by zero', () => {
        expect(evaluateFormula('1 / 0', emptyCtx)).toBe('#DIV/0!');
    });
});

// ── Nested formulas ──────────────────────────────────────────────────────────

describe('nested formulas', () => {
    it('evaluates nested function calls', () => {
        expect(evaluateFormula('SUM(1, ABS(-2), 3)', emptyCtx)).toBe(6);
    });

    it('evaluates IF with arithmetic conditions', () => {
        expect(evaluateFormula('IF(SUM(1, 2) > 2, "big", "small")', emptyCtx)).toBe('big');
    });

    it('evaluates complex expression', () => {
        const ctx = gridContext([[10, 20, 30]]);
        expect(evaluateFormula('SUM(A1:C1) * 2 + ABS(-10)', ctx)).toBe(130);
    });
});
