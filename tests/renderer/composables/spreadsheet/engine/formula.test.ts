import { describe, it, expect } from 'vitest';
import {
    evaluateFormula,
    evaluateFormulaTyped,
    type FormulaContext,
} from '../../../../../src/renderer/composables/spreadsheet/engine/formula';
import type { CellDataType } from '../../../../../src/renderer/composables/spreadsheet/engine/cellTypes';
import type { CellValue } from '../../../../../src/renderer/types/spreadsheet';

// ── Test helpers ─────────────────────────────────────────────────────────────

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

const emptyCtx = gridContext([]);

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
