import { describe, it, expect } from 'vitest';
import { toNumber, evaluate, evaluateVal } from '@/renderer/composables/spreadsheet/engine/evaluator';
import type { FormulaContext } from '@/renderer/composables/spreadsheet/engine/formula';
import type { CellDataType } from '@/renderer/composables/spreadsheet/engine/cellTypes';
import type { CellValue } from '@/renderer/types/spreadsheet';
import type { ASTNode } from '@/renderer/composables/spreadsheet/engine/parser';

// ── Test helpers ─────────────────────────────────────────────────────────────

function gridContext(grid: CellValue[][], types?: CellDataType[][]): FormulaContext {
    const getVal = (col: number, row: number): CellValue => grid[row]?.[col] ?? null;
    const getType = (col: number, row: number): CellDataType => types?.[row]?.[col] ?? 'integer';

    return {
        getCellValue: getVal,
        getCellType: getType,
        getCellRange: (sc, sr, ec, er) => {
            const result: CellValue[] = [];
            for (let r = sr; r <= er; r++) for (let c = sc; c <= ec; c++) result.push(getVal(c, r));
            return result;
        },
        getCellRangeTypes: (sc, sr, ec, er) => {
            const result: CellDataType[] = [];
            for (let r = sr; r <= er; r++) for (let c = sc; c <= ec; c++) result.push(getType(c, r));
            return result;
        },
    };
}

const emptyCtx = gridContext([]);

// ── toNumber ─────────────────────────────────────────────────────────────────

describe('toNumber', () => {
    it('returns 0 for null', () => expect(toNumber(null)).toBe(0));
    it('returns 0 for empty string', () => expect(toNumber('')).toBe(0));
    it('passes through numbers', () => expect(toNumber(42)).toBe(42));
    it('converts true to 1', () => expect(toNumber(true)).toBe(1));
    it('converts false to 0', () => expect(toNumber(false)).toBe(0));
    it('parses numeric strings', () => expect(toNumber('3.14')).toBeCloseTo(3.14));
    it('returns 0 for non-numeric strings', () => expect(toNumber('abc')).toBe(0));
});

// ── Literal evaluation ──────────────────────────────────────────────────────

describe('evaluate literals', () => {
    it('evaluates integer with correct type', () => {
        const r = evaluate({ type: 'number', value: 42 }, emptyCtx);
        expect(r.value).toBe(42);
        expect(r.type).toBe('integer');
    });

    it('evaluates float with correct type', () => {
        const r = evaluate({ type: 'number', value: 3.14 }, emptyCtx);
        expect(r.value).toBe(3.14);
        expect(r.type).toBe('float');
    });

    it('evaluates string literal', () => {
        const r = evaluate({ type: 'string', value: 'hello' }, emptyCtx);
        expect(r.value).toBe('hello');
        expect(r.type).toBe('text');
    });

    it('evaluates boolean', () => {
        expect(evaluate({ type: 'boolean', value: true }, emptyCtx)).toEqual({ value: true, type: 'boolean' });
        expect(evaluate({ type: 'boolean', value: false }, emptyCtx)).toEqual({ value: false, type: 'boolean' });
    });
});

// ── Cell ref evaluation ─────────────────────────────────────────────────────

describe('evaluate cell_ref', () => {
    it('looks up value and type from context', () => {
        const ctx = gridContext([[100]], [['currency_usd']]);
        const r = evaluate({ type: 'cell_ref', col: 0, row: 0 }, ctx);
        expect(r.value).toBe(100);
        expect(r.type).toBe('currency_usd');
    });
});

// ── Range errors ─────────────────────────────────────────────────────────────

describe('range outside function', () => {
    it('throws when range is not inside a function argument', () => {
        expect(() => evaluate({ type: 'range', sc: 0, sr: 0, ec: 1, er: 1 }, emptyCtx)).toThrow(
            'Range can only be used as a function argument',
        );
    });

    it('throws when external_range is not inside a function argument', () => {
        expect(() =>
            evaluate(
                { type: 'external_range', canvasName: null, tableName: 'T', sc: 0, sr: 0, ec: 1, er: 1 },
                emptyCtx,
            ),
        ).toThrow('External range can only be used as a function argument');
    });
});

// ── External cell ref ────────────────────────────────────────────────────────

describe('evaluate external_cell_ref', () => {
    it('throws when cross-table resolvers are missing', () => {
        expect(() =>
            evaluate({ type: 'external_cell_ref', canvasName: null, tableName: 'T', col: 0, row: 0 }, emptyCtx),
        ).toThrow('Cross-table references not supported');
    });

    it('resolves via external resolvers', () => {
        const ctx: FormulaContext = {
            ...emptyCtx,
            resolveExternalCellValue: (_cn, _tn, _c, _r) => 999,
            resolveExternalCellType: (_cn, _tn, _c, _r) => 'currency_eur',
        };
        const r = evaluate({ type: 'external_cell_ref', canvasName: null, tableName: 'T', col: 0, row: 0 }, ctx);
        expect(r.value).toBe(999);
        expect(r.type).toBe('currency_eur');
    });
});

// ── Unary operations ─────────────────────────────────────────────────────────

describe('unary operations', () => {
    it('negates a number', () => {
        const r = evaluate({ type: 'unary', op: '-', operand: { type: 'number', value: 5 } }, emptyCtx);
        expect(r.value).toBe(-5);
        expect(r.type).toBe('integer');
    });

    it('propagates error values through unary minus', () => {
        const ctx = gridContext([['#REF!']], [['text']]);
        const r = evaluate({ type: 'unary', op: '-', operand: { type: 'cell_ref', col: 0, row: 0 } }, ctx);
        expect(r.value).toBe('#REF!');
    });

    it('unary plus is a no-op', () => {
        const r = evaluate({ type: 'unary', op: '+', operand: { type: 'number', value: 7 } }, emptyCtx);
        expect(r.value).toBe(7);
    });
});

// ── Binary arithmetic ────────────────────────────────────────────────────────

describe('binary arithmetic', () => {
    const num = (v: number): ASTNode => ({ type: 'number', value: v });

    it('adds two numbers', () => {
        const r = evaluate({ type: 'binary', op: '+', left: num(3), right: num(4) }, emptyCtx);
        expect(r.value).toBe(7);
        expect(r.type).toBe('integer');
    });

    it('subtracts', () => {
        expect(evaluateVal({ type: 'binary', op: '-', left: num(10), right: num(3) }, emptyCtx)).toBe(7);
    });

    it('multiplies', () => {
        expect(evaluateVal({ type: 'binary', op: '*', left: num(4), right: num(5) }, emptyCtx)).toBe(20);
    });

    it('divides', () => {
        expect(evaluateVal({ type: 'binary', op: '/', left: num(20), right: num(4) }, emptyCtx)).toBe(5);
    });

    it('returns #DIV/0! on division by zero', () => {
        const r = evaluate({ type: 'binary', op: '/', left: num(1), right: num(0) }, emptyCtx);
        expect(r.value).toBe('#DIV/0!');
        expect(r.type).toBe('text');
    });

    it('exponentiates', () => {
        const r = evaluate({ type: 'binary', op: '^', left: num(2), right: num(3) }, emptyCtx);
        expect(r.value).toBe(8);
        expect(r.type).toBe('float');
    });
});

// ── Binary type propagation ──────────────────────────────────────────────────

describe('binary type propagation', () => {
    it('integer + integer = integer', () => {
        const ctx = gridContext([[10, 20]], [['integer', 'integer']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '+',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe(30);
        expect(r.type).toBe('integer');
    });

    it('currency + integer = currency', () => {
        const ctx = gridContext([[100, 50]], [['currency_usd', 'integer']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '+',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe(150);
        expect(r.type).toBe('currency_usd');
    });

    it('currency * integer keeps currency type', () => {
        const ctx = gridContext([[100, 3]], [['currency_eur', 'integer']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '*',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe(300);
        expect(r.type).toBe('currency_eur');
    });

    it('currency / currency = float (ratio)', () => {
        const ctx = gridContext([[100, 50]], [['currency_usd', 'currency_usd']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '/',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe(2);
        expect(r.type).toBe('float');
    });

    it('text + number = #N/A', () => {
        const ctx = gridContext([['hello', 5]], [['text', 'integer']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '+',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe('#N/A');
        expect(r.type).toBe('text');
    });
});

// ── Error propagation ────────────────────────────────────────────────────────

describe('error propagation', () => {
    it('propagates left error in binary op', () => {
        const ctx = gridContext([['#REF!', 5]], [['text', 'integer']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '+',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe('#REF!');
    });

    it('propagates right error in binary op', () => {
        const ctx = gridContext([[5, '#CIRCULAR!']], [['integer', 'text']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '+',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe('#CIRCULAR!');
    });

    it('propagates error in concatenation (left)', () => {
        const ctx = gridContext([['#REF!', 'world']], [['text', 'text']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '&',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe('#REF!');
    });

    it('propagates error in concatenation (right)', () => {
        const ctx = gridContext([['hello', '#ERR!']], [['text', 'text']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '&',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'cell_ref', col: 1, row: 0 },
            },
            ctx,
        );
        expect(r.value).toBe('#ERR!');
    });
});

// ── Comparison operators ─────────────────────────────────────────────────────

describe('comparison operators', () => {
    const num = (v: number): ASTNode => ({ type: 'number', value: v });

    it.each([
        ['=', 1, 1, true],
        ['=', 1, 2, false],
        ['<>', 1, 2, true],
        ['<>', 1, 1, false],
        ['<', 1, 2, true],
        ['<', 2, 1, false],
        ['>', 2, 1, true],
        ['>', 1, 2, false],
        ['<=', 1, 1, true],
        ['<=', 1, 2, true],
        ['<=', 2, 1, false],
        ['>=', 1, 1, true],
        ['>=', 2, 1, true],
        ['>=', 1, 2, false],
    ])('%s: %d vs %d → %s', (op, a, b, expected) => {
        const r = evaluate({ type: 'binary', op, left: num(a), right: num(b) }, emptyCtx);
        expect(r.value).toBe(expected);
        expect(r.type).toBe('boolean');
    });
});

// ── Concatenation ────────────────────────────────────────────────────────────

describe('concatenation', () => {
    it('concatenates two strings', () => {
        const r = evaluate(
            {
                type: 'binary',
                op: '&',
                left: { type: 'string', value: 'hello' },
                right: { type: 'string', value: ' world' },
            },
            emptyCtx,
        );
        expect(r.value).toBe('hello world');
        expect(r.type).toBe('text');
    });

    it('concatenates numbers as strings', () => {
        const r = evaluate(
            { type: 'binary', op: '&', left: { type: 'number', value: 1 }, right: { type: 'number', value: 2 } },
            emptyCtx,
        );
        expect(r.value).toBe('12');
    });

    it('handles null in concatenation', () => {
        const ctx = gridContext([[null]], [['empty']]);
        const r = evaluate(
            {
                type: 'binary',
                op: '&',
                left: { type: 'cell_ref', col: 0, row: 0 },
                right: { type: 'string', value: 'x' },
            },
            ctx,
        );
        expect(r.value).toBe('x');
    });
});

// ── SUM function ─────────────────────────────────────────────────────────────

describe('SUM', () => {
    it('sums a range', () => {
        const ctx = gridContext([[1, 2, 3]]);
        const r = evaluate(
            { type: 'function', name: 'SUM', args: [{ type: 'range', sc: 0, sr: 0, ec: 2, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(6);
    });

    it('returns 0 for empty range', () => {
        const r = evaluate(
            { type: 'function', name: 'SUM', args: [{ type: 'range', sc: 0, sr: 0, ec: 0, er: 0 }] },
            emptyCtx,
        );
        expect(r.value).toBe(0);
    });

    it('propagates error values', () => {
        const ctx = gridContext([['#REF!', 2]], [['text', 'integer']]);
        const r = evaluate(
            { type: 'function', name: 'SUM', args: [{ type: 'range', sc: 0, sr: 0, ec: 1, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe('#REF!');
    });

    it('returns #N/A when text is included', () => {
        const ctx = gridContext([['hello', 2]], [['text', 'integer']]);
        const r = evaluate(
            { type: 'function', name: 'SUM', args: [{ type: 'range', sc: 0, sr: 0, ec: 1, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe('#N/A');
    });

    it('preserves currency type', () => {
        const ctx = gridContext([[100, 200]], [['currency_usd', 'currency_usd']]);
        const r = evaluate(
            { type: 'function', name: 'SUM', args: [{ type: 'range', sc: 0, sr: 0, ec: 1, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(300);
        expect(r.type).toBe('currency_usd');
    });
});

// ── AVERAGE function ─────────────────────────────────────────────────────────

describe('AVERAGE', () => {
    it('computes average', () => {
        const ctx = gridContext([[10, 20, 30]]);
        const r = evaluate(
            { type: 'function', name: 'AVERAGE', args: [{ type: 'range', sc: 0, sr: 0, ec: 2, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(20);
    });

    it('returns #DIV/0! for empty numeric set', () => {
        const r = evaluate(
            { type: 'function', name: 'AVERAGE', args: [{ type: 'range', sc: 0, sr: 0, ec: 0, er: 0 }] },
            emptyCtx,
        );
        expect(r.value).toBe('#DIV/0!');
    });

    it('always returns at least float type', () => {
        const ctx = gridContext([[2, 4]], [['integer', 'integer']]);
        const r = evaluate(
            { type: 'function', name: 'AVERAGE', args: [{ type: 'range', sc: 0, sr: 0, ec: 1, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(3);
        expect(r.type).toBe('float');
    });

    it('returns #N/A when text is in range', () => {
        const ctx = gridContext([['hello', 2]], [['text', 'integer']]);
        const r = evaluate(
            { type: 'function', name: 'AVERAGE', args: [{ type: 'range', sc: 0, sr: 0, ec: 1, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe('#N/A');
    });
});

// ── MIN / MAX ────────────────────────────────────────────────────────────────

describe('MIN / MAX', () => {
    const ctx = gridContext([[5, 1, 9, 3]]);

    it('MIN returns smallest value', () => {
        const r = evaluate(
            { type: 'function', name: 'MIN', args: [{ type: 'range', sc: 0, sr: 0, ec: 3, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(1);
    });

    it('MAX returns largest value', () => {
        const r = evaluate(
            { type: 'function', name: 'MAX', args: [{ type: 'range', sc: 0, sr: 0, ec: 3, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(9);
    });

    it('MIN returns 0 for empty range', () => {
        expect(
            evaluate({ type: 'function', name: 'MIN', args: [{ type: 'range', sc: 0, sr: 0, ec: 0, er: 0 }] }, emptyCtx)
                .value,
        ).toBe(0);
    });

    it('MAX returns 0 for empty range', () => {
        expect(
            evaluate({ type: 'function', name: 'MAX', args: [{ type: 'range', sc: 0, sr: 0, ec: 0, er: 0 }] }, emptyCtx)
                .value,
        ).toBe(0);
    });

    it('propagates error values', () => {
        const errCtx = gridContext([['#NUM!', 5]], [['text', 'integer']]);
        expect(
            evaluate({ type: 'function', name: 'MIN', args: [{ type: 'range', sc: 0, sr: 0, ec: 1, er: 0 }] }, errCtx)
                .value,
        ).toBe('#NUM!');
        expect(
            evaluate({ type: 'function', name: 'MAX', args: [{ type: 'range', sc: 0, sr: 0, ec: 1, er: 0 }] }, errCtx)
                .value,
        ).toBe('#NUM!');
    });
});

// ── COUNT / COUNTA ───────────────────────────────────────────────────────────

describe('COUNT / COUNTA', () => {
    it('COUNT counts numeric values only', () => {
        const ctx = gridContext([[1, 'abc', null, 3]]);
        const r = evaluate(
            { type: 'function', name: 'COUNT', args: [{ type: 'range', sc: 0, sr: 0, ec: 3, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(2);
        expect(r.type).toBe('integer');
    });

    it('COUNTA counts all non-empty values', () => {
        const ctx = gridContext([[1, 'abc', null, 3]]);
        const r = evaluate(
            { type: 'function', name: 'COUNTA', args: [{ type: 'range', sc: 0, sr: 0, ec: 3, er: 0 }] },
            ctx,
        );
        expect(r.value).toBe(3);
        expect(r.type).toBe('integer');
    });
});

// ── ROUND ────────────────────────────────────────────────────────────────────

describe('ROUND', () => {
    it('rounds to specified digits', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'ROUND',
                args: [
                    { type: 'number', value: 3.456 },
                    { type: 'number', value: 2 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(3.46);
    });

    it('rounds to integer with 0 digits', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'ROUND',
                args: [
                    { type: 'number', value: 3.7 },
                    { type: 'number', value: 0 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(4);
    });

    it('defaults to 0 digits when not provided', () => {
        const r = evaluate({ type: 'function', name: 'ROUND', args: [{ type: 'number', value: 3.7 }] }, emptyCtx);
        expect(r.value).toBe(4);
    });
});

// ── ABS ──────────────────────────────────────────────────────────────────────

describe('ABS', () => {
    it('absolute value of negative', () => {
        const r = evaluate({ type: 'function', name: 'ABS', args: [{ type: 'number', value: -7 }] }, emptyCtx);
        expect(r.value).toBe(7);
    });

    it('preserves numeric type', () => {
        const ctx = gridContext([[-100]], [['currency_usd']]);
        const r = evaluate({ type: 'function', name: 'ABS', args: [{ type: 'cell_ref', col: 0, row: 0 }] }, ctx);
        expect(r.value).toBe(100);
        expect(r.type).toBe('currency_usd');
    });
});

// ── SQRT ─────────────────────────────────────────────────────────────────────

describe('SQRT', () => {
    it('computes square root', () => {
        const r = evaluate({ type: 'function', name: 'SQRT', args: [{ type: 'number', value: 16 }] }, emptyCtx);
        expect(r.value).toBe(4);
        expect(r.type).toBe('float');
    });

    it('returns #NUM! for negative input', () => {
        const r = evaluate({ type: 'function', name: 'SQRT', args: [{ type: 'number', value: -4 }] }, emptyCtx);
        expect(r.value).toBe('#NUM!');
        expect(r.type).toBe('text');
    });
});

// ── MOD ──────────────────────────────────────────────────────────────────────

describe('MOD', () => {
    it('computes modulo', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'MOD',
                args: [
                    { type: 'number', value: 10 },
                    { type: 'number', value: 3 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(1);
        expect(r.type).toBe('integer');
    });

    it('returns #DIV/0! when divisor is zero', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'MOD',
                args: [
                    { type: 'number', value: 10 },
                    { type: 'number', value: 0 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe('#DIV/0!');
        expect(r.type).toBe('text');
    });
});

// ── INT ──────────────────────────────────────────────────────────────────────

describe('INT', () => {
    it('truncates to integer (floor)', () => {
        const r = evaluate({ type: 'function', name: 'INT', args: [{ type: 'number', value: 3.9 }] }, emptyCtx);
        expect(r.value).toBe(3);
        expect(r.type).toBe('integer');
    });

    it('floors negative values', () => {
        const r = evaluate({ type: 'function', name: 'INT', args: [{ type: 'number', value: -3.1 }] }, emptyCtx);
        expect(r.value).toBe(-4);
    });
});

// ── CEILING / FLOOR ──────────────────────────────────────────────────────────

describe('CEILING / FLOOR', () => {
    it('CEILING rounds up to multiple', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'CEILING',
                args: [
                    { type: 'number', value: 7 },
                    { type: 'number', value: 5 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(10);
    });

    it('FLOOR rounds down to multiple', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'FLOOR',
                args: [
                    { type: 'number', value: 7 },
                    { type: 'number', value: 5 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(5);
    });

    it('CEILING defaults to significance 1', () => {
        const r = evaluate({ type: 'function', name: 'CEILING', args: [{ type: 'number', value: 3.2 }] }, emptyCtx);
        expect(r.value).toBe(4);
    });

    it('FLOOR defaults to significance 1', () => {
        const r = evaluate({ type: 'function', name: 'FLOOR', args: [{ type: 'number', value: 3.9 }] }, emptyCtx);
        expect(r.value).toBe(3);
    });

    it('CEILING returns 0 when significance is 0', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'CEILING',
                    args: [
                        { type: 'number', value: 7 },
                        { type: 'number', value: 0 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe(0);
    });

    it('FLOOR returns 0 when significance is 0', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'FLOOR',
                    args: [
                        { type: 'number', value: 7 },
                        { type: 'number', value: 0 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe(0);
    });
});

// ── POWER ────────────────────────────────────────────────────────────────────

describe('POWER', () => {
    it('raises to a power', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'POWER',
                args: [
                    { type: 'number', value: 2 },
                    { type: 'number', value: 10 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(1024);
        expect(r.type).toBe('float');
    });
});

// ── Logic functions ──────────────────────────────────────────────────────────

describe('logic functions', () => {
    it('IF returns true branch when condition is truthy', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'IF',
                args: [
                    { type: 'boolean', value: true },
                    { type: 'string', value: 'yes' },
                    { type: 'string', value: 'no' },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe('yes');
    });

    it('IF returns false branch when condition is falsy', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'IF',
                args: [
                    { type: 'boolean', value: false },
                    { type: 'string', value: 'yes' },
                    { type: 'string', value: 'no' },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe('no');
    });

    it('IF with only two args returns FALSE for falsy condition', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'IF',
                args: [
                    { type: 'boolean', value: false },
                    { type: 'string', value: 'yes' },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(false);
    });

    it('IF treats 0 as falsy', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'IF',
                args: [
                    { type: 'number', value: 0 },
                    { type: 'string', value: 'yes' },
                    { type: 'string', value: 'no' },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe('no');
    });

    it('AND returns true when all truthy', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'AND',
                args: [
                    { type: 'boolean', value: true },
                    { type: 'number', value: 1 },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe(true);
        expect(r.type).toBe('boolean');
    });

    it('AND returns false when any falsy', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'AND',
                    args: [
                        { type: 'boolean', value: true },
                        { type: 'number', value: 0 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe(false);
    });

    it('OR returns true when any truthy', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'OR',
                    args: [
                        { type: 'boolean', value: false },
                        { type: 'number', value: 1 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe(true);
    });

    it('OR returns false when all falsy', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'OR',
                    args: [
                        { type: 'boolean', value: false },
                        { type: 'number', value: 0 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe(false);
    });

    it('NOT negates boolean', () => {
        expect(
            evaluate({ type: 'function', name: 'NOT', args: [{ type: 'boolean', value: true }] }, emptyCtx).value,
        ).toBe(false);
        expect(
            evaluate({ type: 'function', name: 'NOT', args: [{ type: 'boolean', value: false }] }, emptyCtx).value,
        ).toBe(true);
    });
});

// ── Text functions ───────────────────────────────────────────────────────────

describe('text functions', () => {
    it('UPPER', () => {
        const r = evaluate({ type: 'function', name: 'UPPER', args: [{ type: 'string', value: 'hello' }] }, emptyCtx);
        expect(r.value).toBe('HELLO');
        expect(r.type).toBe('text');
    });

    it('LOWER', () => {
        expect(
            evaluate({ type: 'function', name: 'LOWER', args: [{ type: 'string', value: 'HELLO' }] }, emptyCtx).value,
        ).toBe('hello');
    });

    it('LEN', () => {
        const r = evaluate({ type: 'function', name: 'LEN', args: [{ type: 'string', value: 'hello' }] }, emptyCtx);
        expect(r.value).toBe(5);
        expect(r.type).toBe('integer');
    });

    it('TRIM', () => {
        expect(
            evaluate({ type: 'function', name: 'TRIM', args: [{ type: 'string', value: '  hi  ' }] }, emptyCtx).value,
        ).toBe('hi');
    });

    it('LEFT with count', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'LEFT',
                    args: [
                        { type: 'string', value: 'hello' },
                        { type: 'number', value: 3 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe('hel');
    });

    it('LEFT defaults to 1 character', () => {
        expect(
            evaluate({ type: 'function', name: 'LEFT', args: [{ type: 'string', value: 'hello' }] }, emptyCtx).value,
        ).toBe('h');
    });

    it('RIGHT with count', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'RIGHT',
                    args: [
                        { type: 'string', value: 'hello' },
                        { type: 'number', value: 3 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe('llo');
    });

    it('RIGHT defaults to 1 character', () => {
        expect(
            evaluate({ type: 'function', name: 'RIGHT', args: [{ type: 'string', value: 'hello' }] }, emptyCtx).value,
        ).toBe('o');
    });

    it('MID extracts substring', () => {
        expect(
            evaluate(
                {
                    type: 'function',
                    name: 'MID',
                    args: [
                        { type: 'string', value: 'hello' },
                        { type: 'number', value: 2 },
                        { type: 'number', value: 3 },
                    ],
                },
                emptyCtx,
            ).value,
        ).toBe('ell');
    });

    it('CONCAT joins arguments', () => {
        const r = evaluate(
            {
                type: 'function',
                name: 'CONCAT',
                args: [
                    { type: 'string', value: 'a' },
                    { type: 'string', value: 'b' },
                    { type: 'string', value: 'c' },
                ],
            },
            emptyCtx,
        );
        expect(r.value).toBe('abc');
        expect(r.type).toBe('text');
    });

    it('CONCAT handles null values', () => {
        const ctx = gridContext([[null, 'world']], [['empty', 'text']]);
        const r = evaluate(
            {
                type: 'function',
                name: 'CONCAT',
                args: [
                    { type: 'cell_ref', col: 0, row: 0 },
                    { type: 'cell_ref', col: 1, row: 0 },
                ],
            },
            ctx,
        );
        expect(r.value).toBe('world');
    });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
    it('PI returns π', () => {
        const r = evaluate({ type: 'function', name: 'PI', args: [] }, emptyCtx);
        expect(r.value).toBeCloseTo(Math.PI);
        expect(r.type).toBe('float');
    });

    it('NOW returns a string', () => {
        const r = evaluate({ type: 'function', name: 'NOW', args: [] }, emptyCtx);
        expect(typeof r.value).toBe('string');
        expect(r.type).toBe('text');
    });

    it('TODAY returns a string', () => {
        const r = evaluate({ type: 'function', name: 'TODAY', args: [] }, emptyCtx);
        expect(typeof r.value).toBe('string');
        expect(r.type).toBe('text');
    });
});

// ── Unknown function ─────────────────────────────────────────────────────────

describe('unknown function', () => {
    it('returns #NAME? error', () => {
        const r = evaluate({ type: 'function', name: 'NOSUCH', args: [] }, emptyCtx);
        expect(r.value).toBe('#NAME? (NOSUCH)');
        expect(r.type).toBe('text');
    });
});

// ── evaluateVal ──────────────────────────────────────────────────────────────

describe('evaluateVal', () => {
    it('returns just the value (not the typed wrapper)', () => {
        const v = evaluateVal({ type: 'number', value: 42 }, emptyCtx);
        expect(v).toBe(42);
    });
});
