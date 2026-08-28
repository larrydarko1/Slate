import { describe, it, expect } from 'vitest';
import { tokenize } from '@/renderer/composables/spreadsheet/engine/tokenizer';
import { Parser, parseCellRef, type ASTNode } from '@/renderer/composables/spreadsheet/engine/parser';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a formula string into an AST. */
function parse(src: string): ASTNode {
    return new Parser(tokenize(src)).parse();
}

// ── parseCellRef ─────────────────────────────────────────────────────────────

describe('parseCellRef', () => {
    it('parses A1 → col 0, row 0', () => {
        expect(parseCellRef('A1')).toEqual({ col: 0, row: 0 });
    });

    it('parses B2 → col 1, row 1', () => {
        expect(parseCellRef('B2')).toEqual({ col: 1, row: 1 });
    });

    it('parses Z1 → col 25, row 0', () => {
        expect(parseCellRef('Z1')).toEqual({ col: 25, row: 0 });
    });

    it('parses AA1 → col 26, row 0', () => {
        expect(parseCellRef('AA1')).toEqual({ col: 26, row: 0 });
    });

    it('parses AB23 → col 27, row 22', () => {
        expect(parseCellRef('AB23')).toEqual({ col: 27, row: 22 });
    });

    it('throws on invalid ref', () => {
        expect(() => parseCellRef('123')).toThrow('Invalid cell reference');
        expect(() => parseCellRef('')).toThrow('Invalid cell reference');
    });
});

// ── Literals ─────────────────────────────────────────────────────────────────

describe('literals', () => {
    it('parses a number', () => {
        expect(parse('42')).toEqual({ type: 'number', value: 42 });
    });

    it('parses a float', () => {
        expect(parse('3.14')).toEqual({ type: 'number', value: 3.14 });
    });

    it('parses a string', () => {
        expect(parse('"hello"')).toEqual({ type: 'string', value: 'hello' });
    });

    it('parses TRUE', () => {
        expect(parse('TRUE')).toEqual({ type: 'boolean', value: true });
    });

    it('parses FALSE', () => {
        expect(parse('FALSE')).toEqual({ type: 'boolean', value: false });
    });
});

// ── Cell references and ranges ───────────────────────────────────────────────

describe('cell references', () => {
    it('parses a single cell reference', () => {
        expect(parse('A1')).toEqual({ type: 'cell_ref', col: 0, row: 0 });
    });

    it('parses a cell range', () => {
        expect(parse('A1:C3')).toEqual({
            type: 'range',
            sc: 0,
            sr: 0,
            ec: 2,
            er: 2,
        });
    });

    it('parses B2', () => {
        expect(parse('B2')).toEqual({ type: 'cell_ref', col: 1, row: 1 });
    });
});

// ── Arithmetic (operator precedence) ─────────────────────────────────────────

describe('arithmetic', () => {
    it('parses addition', () => {
        const ast = parse('1 + 2');
        expect(ast).toEqual({
            type: 'binary',
            op: '+',
            left: { type: 'number', value: 1 },
            right: { type: 'number', value: 2 },
        });
    });

    it('parses subtraction', () => {
        const ast = parse('5 - 3');
        expect(ast).toEqual({
            type: 'binary',
            op: '-',
            left: { type: 'number', value: 5 },
            right: { type: 'number', value: 3 },
        });
    });

    it('multiplication binds tighter than addition', () => {
        const ast = parse('1 + 2 * 3');
        expect(ast).toMatchObject({
            type: 'binary',
            op: '+',
            left: { type: 'number', value: 1 },
            right: {
                type: 'binary',
                op: '*',
                left: { type: 'number', value: 2 },
                right: { type: 'number', value: 3 },
            },
        });
    });

    it('exponentiation binds tighter than multiplication', () => {
        const ast = parse('2 * 3 ^ 4');
        expect(ast).toMatchObject({
            type: 'binary',
            op: '*',
            left: { type: 'number', value: 2 },
            right: {
                type: 'binary',
                op: '^',
                left: { type: 'number', value: 3 },
                right: { type: 'number', value: 4 },
            },
        });
    });

    it('parentheses override precedence', () => {
        const ast = parse('(1 + 2) * 3');
        expect(ast).toMatchObject({
            type: 'binary',
            op: '*',
            left: {
                type: 'binary',
                op: '+',
                left: { type: 'number', value: 1 },
                right: { type: 'number', value: 2 },
            },
            right: { type: 'number', value: 3 },
        });
    });
});

// ── Unary ────────────────────────────────────────────────────────────────────

describe('unary operators', () => {
    it('parses unary minus', () => {
        expect(parse('-5')).toEqual({
            type: 'unary',
            op: '-',
            operand: { type: 'number', value: 5 },
        });
    });

    it('parses double unary minus', () => {
        const ast = parse('--5');
        expect(ast).toEqual({
            type: 'unary',
            op: '-',
            operand: {
                type: 'unary',
                op: '-',
                operand: { type: 'number', value: 5 },
            },
        });
    });

    it('unary plus is a no-op', () => {
        expect(parse('+5')).toEqual({ type: 'number', value: 5 });
    });
});

// ── Comparison ───────────────────────────────────────────────────────────────

describe('comparison operators', () => {
    it.each([
        ['1 = 2', '='],
        ['1 <> 2', '<>'],
        ['1 < 2', '<'],
        ['1 > 2', '>'],
        ['1 <= 2', '<='],
        ['1 >= 2', '>='],
    ])('parses %s with op %s', (src, op) => {
        const ast = parse(src);
        expect(ast).toMatchObject({
            type: 'binary',
            op,
            left: { type: 'number', value: 1 },
            right: { type: 'number', value: 2 },
        });
    });
});

// ── Concatenation ────────────────────────────────────────────────────────────

describe('concatenation', () => {
    it('parses & as a binary operator', () => {
        const ast = parse('"a" & "b"');
        expect(ast).toEqual({
            type: 'binary',
            op: '&',
            left: { type: 'string', value: 'a' },
            right: { type: 'string', value: 'b' },
        });
    });

    it('& binds looser than comparison', () => {
        // "a" & 1 < 2 → "a" & (1 < 2)
        const ast = parse('"a" & 1 < 2');
        expect(ast).toMatchObject({
            type: 'binary',
            op: '&',
            left: { type: 'string', value: 'a' },
            right: { type: 'binary', op: '<' },
        });
    });
});

// ── Functions ────────────────────────────────────────────────────────────────

describe('functions', () => {
    it('parses a no-arg function', () => {
        expect(parse('PI()')).toEqual({
            type: 'function',
            name: 'PI',
            args: [],
        });
    });

    it('parses a single-arg function', () => {
        expect(parse('ABS(-5)')).toEqual({
            type: 'function',
            name: 'ABS',
            args: [{ type: 'unary', op: '-', operand: { type: 'number', value: 5 } }],
        });
    });

    it('parses a multi-arg function', () => {
        const ast = parse('IF(1, 2, 3)');
        expect(ast).toMatchObject({
            type: 'function',
            name: 'IF',
            args: [
                { type: 'number', value: 1 },
                { type: 'number', value: 2 },
                { type: 'number', value: 3 },
            ],
        });
    });

    it('parses nested function calls', () => {
        const ast = parse('SUM(1, ABS(2))');
        expect(ast).toMatchObject({
            type: 'function',
            name: 'SUM',
            args: [
                { type: 'number', value: 1 },
                {
                    type: 'function',
                    name: 'ABS',
                    args: [{ type: 'number', value: 2 }],
                },
            ],
        });
    });

    it('parses a function with a range arg', () => {
        const ast = parse('SUM(A1:C3)');
        expect(ast).toMatchObject({
            type: 'function',
            name: 'SUM',
            args: [{ type: 'range', sc: 0, sr: 0, ec: 2, er: 2 }],
        });
    });
});

// ── External references ──────────────────────────────────────────────────────

describe('external references', () => {
    it('parses a cross-table cell ref (quoted name)', () => {
        const ast = parse("'Table 1'::A1");
        expect(ast).toEqual({
            type: 'external_cell_ref',
            canvasName: null,
            tableName: 'Table 1',
            col: 0,
            row: 0,
        });
    });

    it('parses a cross-table range (quoted name)', () => {
        const ast = parse("'Table 1'::A1:B2");
        expect(ast).toEqual({
            type: 'external_range',
            canvasName: null,
            tableName: 'Table 1',
            sc: 0,
            sr: 0,
            ec: 1,
            er: 1,
        });
    });

    it('parses a cross-canvas cell ref', () => {
        const ast = parse("'Canvas 2'::'Table 1'::B3");
        expect(ast).toEqual({
            type: 'external_cell_ref',
            canvasName: 'Canvas 2',
            tableName: 'Table 1',
            col: 1,
            row: 2,
        });
    });

    it('parses a cross-canvas range', () => {
        const ast = parse("'Canvas 2'::'Table 1'::A1:C3");
        expect(ast).toEqual({
            type: 'external_range',
            canvasName: 'Canvas 2',
            tableName: 'Table 1',
            sc: 0,
            sr: 0,
            ec: 2,
            er: 2,
        });
    });

    it('parses an identifier-based table ref', () => {
        // CELL_REF-looking name + :: (e.g. Table1::A1 won't work because
        // Table1 gets parsed as CELL_REF — but names that are pure letters work)
        const ast = parse('Sales::A1');
        expect(ast).toEqual({
            type: 'external_cell_ref',
            canvasName: null,
            tableName: 'SALES',
            col: 0,
            row: 0,
        });
    });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
    it('throws on missing closing paren', () => {
        expect(() => parse('(1 + 2')).toThrow('Expected RPAREN');
    });

    it('throws on unexpected EOF mid-expression', () => {
        expect(() => parse('1 +')).toThrow();
    });

    it('throws on trailing tokens', () => {
        expect(() => parse('1 2')).toThrow('Expected EOF');
    });

    it('throws on a bare quoted name without ::', () => {
        expect(() => parse("'Table 1'")).toThrow('expected ::');
    });
});
