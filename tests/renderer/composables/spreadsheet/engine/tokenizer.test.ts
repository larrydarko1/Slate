import { describe, it, expect } from 'vitest';
import { tokenize, type TokenType } from '@/renderer/composables/spreadsheet/engine/tokenizer';

/** Extract just the type and value from tokens (ignoring EOF) for easy assertions. */
function tokenTypes(src: string): { type: TokenType; value: string }[] {
    return tokenize(src)
        .filter((t) => t.type !== 'EOF')
        .map(({ type, value }) => ({ type, value }));
}

/** Shorthand: get the types of all non-EOF tokens. */
function types(src: string): TokenType[] {
    return tokenize(src)
        .filter((t) => t.type !== 'EOF')
        .map((t) => t.type);
}

// ── Numbers ──────────────────────────────────────────────────────────────────

describe('numbers', () => {
    it('tokenizes an integer', () => {
        const tokens = tokenize('42');
        expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: '42', num: 42 });
    });

    it('tokenizes a float', () => {
        const tokens = tokenize('3.14');
        expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: '3.14', num: 3.14 });
    });

    it('throws on a leading-dot number (not supported)', () => {
        expect(() => tokenize('.25')).toThrow('Unexpected character: .');
    });

    it('tokenizes zero', () => {
        const tokens = tokenize('0');
        expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: '0', num: 0 });
    });

    it('tokenizes multiple numbers separated by operators', () => {
        expect(types('1 + 2')).toEqual(['NUMBER', 'PLUS', 'NUMBER']);
    });
});

// ── Strings ──────────────────────────────────────────────────────────────────

describe('strings', () => {
    it('tokenizes a double-quoted string', () => {
        const tokens = tokenize('"hello"');
        expect(tokens[0]).toMatchObject({ type: 'STRING', value: 'hello' });
    });

    it('tokenizes an empty string', () => {
        const tokens = tokenize('""');
        expect(tokens[0]).toMatchObject({ type: 'STRING', value: '' });
    });

    it('tokenizes a string with spaces', () => {
        const tokens = tokenize('"hello world"');
        expect(tokens[0]).toMatchObject({ type: 'STRING', value: 'hello world' });
    });
});

// ── Quoted names ─────────────────────────────────────────────────────────────

describe('quoted names', () => {
    it('tokenizes a single-quoted name', () => {
        const tokens = tokenize("'Table 1'");
        expect(tokens[0]).toMatchObject({ type: 'QUOTED_NAME', value: 'Table 1' });
    });

    it('tokenizes a quoted name with special characters', () => {
        const tokens = tokenize("'My Canvas #2'");
        expect(tokens[0]).toMatchObject({ type: 'QUOTED_NAME', value: 'My Canvas #2' });
    });
});

// ── Booleans ─────────────────────────────────────────────────────────────────

describe('booleans', () => {
    it.each([
        ['TRUE', 'TRUE'],
        ['true', 'TRUE'],
        ['True', 'TRUE'],
        ['FALSE', 'FALSE'],
        ['false', 'FALSE'],
    ])('tokenizes %s as BOOLEAN %s', (input, expected) => {
        const tokens = tokenize(input);
        expect(tokens[0]).toMatchObject({ type: 'BOOLEAN', value: expected });
    });
});

// ── Cell references ──────────────────────────────────────────────────────────

describe('cell references', () => {
    it('tokenizes a simple cell reference', () => {
        const tokens = tokenize('A1');
        expect(tokens[0]).toMatchObject({ type: 'CELL_REF', value: 'A1' });
    });

    it('tokenizes multi-letter column reference', () => {
        const tokens = tokenize('AB23');
        expect(tokens[0]).toMatchObject({ type: 'CELL_REF', value: 'AB23' });
    });

    it('uppercases cell references', () => {
        const tokens = tokenize('c5');
        expect(tokens[0]).toMatchObject({ type: 'CELL_REF', value: 'C5' });
    });

    it('tokenizes a range expression', () => {
        expect(types('A1:C3')).toEqual(['CELL_REF', 'COLON', 'CELL_REF']);
    });
});

// ── Identifiers (function names) ─────────────────────────────────────────────

describe('identifiers', () => {
    it('tokenizes a function name', () => {
        expect(types('SUM(A1)')).toEqual(['IDENTIFIER', 'LPAREN', 'CELL_REF', 'RPAREN']);
    });

    it('uppercases identifiers', () => {
        const tokens = tokenize('sum');
        expect(tokens[0]).toMatchObject({ type: 'IDENTIFIER', value: 'SUM' });
    });

    it('tokenizes underscored identifiers', () => {
        const tokens = tokenize('MY_FUNC');
        expect(tokens[0]).toMatchObject({ type: 'IDENTIFIER', value: 'MY_FUNC' });
    });
});

// ── Operators ────────────────────────────────────────────────────────────────

describe('operators', () => {
    it.each<[string, TokenType, string]>([
        ['+', 'PLUS', '+'],
        ['-', 'MINUS', '-'],
        ['*', 'STAR', '*'],
        ['/', 'SLASH', '/'],
        ['^', 'CARET', '^'],
        ['&', 'AMP', '&'],
        ['=', 'EQ', '='],
        ['<', 'LT', '<'],
        ['>', 'GT', '>'],
    ])('tokenizes %s as %s', (input, expectedType, expectedValue) => {
        const tokens = tokenize(input);
        expect(tokens[0]).toMatchObject({ type: expectedType, value: expectedValue });
    });
});

// ── Multi-character operators ────────────────────────────────────────────────

describe('multi-character operators', () => {
    it.each<[string, TokenType, string]>([
        ['<>', 'NEQ', '<>'],
        ['<=', 'LTE', '<='],
        ['>=', 'GTE', '>='],
        ['::', 'DOUBLE_COLON', '::'],
    ])('tokenizes %s as %s', (input, expectedType, expectedValue) => {
        const tokens = tokenize(input);
        expect(tokens[0]).toMatchObject({ type: expectedType, value: expectedValue });
    });
});

// ── Punctuation ──────────────────────────────────────────────────────────────

describe('punctuation', () => {
    it.each<[string, TokenType]>([
        ['(', 'LPAREN'],
        [')', 'RPAREN'],
        [',', 'COMMA'],
        [':', 'COLON'],
    ])('tokenizes %s as %s', (input, expectedType) => {
        const tokens = tokenize(input);
        expect(tokens[0].type).toBe(expectedType);
    });
});

// ── Whitespace ───────────────────────────────────────────────────────────────

describe('whitespace', () => {
    it('skips spaces', () => {
        expect(types('1   +   2')).toEqual(['NUMBER', 'PLUS', 'NUMBER']);
    });

    it('skips tabs', () => {
        expect(types('1\t+\t2')).toEqual(['NUMBER', 'PLUS', 'NUMBER']);
    });

    it('skips newlines', () => {
        expect(types('1\n+\n2')).toEqual(['NUMBER', 'PLUS', 'NUMBER']);
    });
});

// ── EOF ──────────────────────────────────────────────────────────────────────

describe('EOF', () => {
    it('always ends with EOF', () => {
        const tokens = tokenize('1');
        expect(tokens[tokens.length - 1].type).toBe('EOF');
    });

    it('returns only EOF for empty input', () => {
        const tokens = tokenize('');
        expect(tokens).toEqual([{ type: 'EOF', value: '' }]);
    });
});

// ── Error cases ──────────────────────────────────────────────────────────────

describe('error handling', () => {
    it('throws on unexpected character', () => {
        expect(() => tokenize('@')).toThrow('Unexpected character: @');
    });

    it('throws on tilde', () => {
        expect(() => tokenize('~')).toThrow('Unexpected character: ~');
    });
});

// ── Complex expressions ──────────────────────────────────────────────────────

describe('complex expressions', () => {
    it('tokenizes a function call with range', () => {
        expect(types('SUM(A1:C3)')).toEqual(['IDENTIFIER', 'LPAREN', 'CELL_REF', 'COLON', 'CELL_REF', 'RPAREN']);
    });

    it('tokenizes nested function calls', () => {
        expect(types('IF(A1>0,SUM(B1:B5),"no")')).toEqual([
            'IDENTIFIER',
            'LPAREN',
            'CELL_REF',
            'GT',
            'NUMBER',
            'COMMA',
            'IDENTIFIER',
            'LPAREN',
            'CELL_REF',
            'COLON',
            'CELL_REF',
            'RPAREN',
            'COMMA',
            'STRING',
            'RPAREN',
        ]);
    });

    it('tokenizes comparison operators in expressions', () => {
        expect(types('A1 <= 10')).toEqual(['CELL_REF', 'LTE', 'NUMBER']);
        expect(types('A1 >= 10')).toEqual(['CELL_REF', 'GTE', 'NUMBER']);
        expect(types('A1 <> 10')).toEqual(['CELL_REF', 'NEQ', 'NUMBER']);
    });

    it('tokenizes concatenation with cell refs', () => {
        expect(types('"total: " & A1')).toEqual(['STRING', 'AMP', 'CELL_REF']);
    });

    it('tokenizes an external reference with double colon', () => {
        const result = tokenTypes("'Table 1'::A1");
        expect(result).toEqual([
            { type: 'QUOTED_NAME', value: 'Table 1' },
            { type: 'DOUBLE_COLON', value: '::' },
            { type: 'CELL_REF', value: 'A1' },
        ]);
    });

    it('tokenizes a cross-canvas reference', () => {
        const result = tokenTypes("'Canvas 2'::'Table 1'::B3");
        expect(result).toEqual([
            { type: 'QUOTED_NAME', value: 'Canvas 2' },
            { type: 'DOUBLE_COLON', value: '::' },
            { type: 'QUOTED_NAME', value: 'Table 1' },
            { type: 'DOUBLE_COLON', value: '::' },
            { type: 'CELL_REF', value: 'B3' },
        ]);
    });

    it('tokenizes unary minus before a cell ref', () => {
        expect(types('-A1')).toEqual(['MINUS', 'CELL_REF']);
    });

    it('tokenizes exponentiation', () => {
        expect(types('2 ^ 3')).toEqual(['NUMBER', 'CARET', 'NUMBER']);
    });
});
