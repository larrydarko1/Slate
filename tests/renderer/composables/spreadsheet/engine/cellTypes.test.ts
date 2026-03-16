import { describe, it, expect } from 'vitest';
import {
    detectType,
    isNumericType,
    isCurrencyType,
    resolveType,
    resolveTypeList,
    formatValue,
    formatCellDisplay,
    getTypeAlignment,
    getTypeLabel,
    coerceToType,
    type CellDataType,
} from '../../../../../src/renderer/composables/spreadsheet/engine/cellTypes';

// ── detectType ───────────────────────────────────────────────────────────────

describe('detectType', () => {
    // Empty / null
    it.each(['', null, undefined])('returns empty for "%s"', (input) => {
        const result = detectType(input as string);
        expect(result.type).toBe('empty');
        expect(result.numericValue).toBeNull();
    });

    // Booleans
    it.each([
        ['true', 1],
        ['TRUE', 1],
        ['false', 0],
        ['FALSE', 0],
    ])('detects boolean "%s"', (input, expected) => {
        const result = detectType(input);
        expect(result.type).toBe('boolean');
        expect(result.numericValue).toBe(expected);
    });

    // Currency USD
    it.each([
        ['$10', 10],
        ['$1,234.56', 1234.56],
        ['-$50.00', -50],
        ['$0.99', 0.99],
    ])('detects currency_usd "%s"', (input, expected) => {
        const result = detectType(input);
        expect(result.type).toBe('currency_usd');
        expect(result.numericValue).toBeCloseTo(expected);
    });

    // Currency EUR
    it.each([
        ['€10', 10],
        ['€1.234,56', 1234.56],
        ['-€50,00', -50],
        ['12,50€', 12.5],
    ])('detects currency_eur "%s"', (input, expected) => {
        const result = detectType(input);
        expect(result.type).toBe('currency_eur');
        expect(result.numericValue).toBeCloseTo(expected);
    });

    // Percentage
    it.each([
        ['50%', 0.5],
        ['100%', 1],
        ['12.5%', 0.125],
        ['-3%', -0.03],
    ])('detects percent "%s"', (input, expected) => {
        const result = detectType(input);
        expect(result.type).toBe('percent');
        expect(result.numericValue).toBeCloseTo(expected);
    });

    // Integer
    it.each([
        ['42', 42],
        ['-7', -7],
        ['0', 0],
    ])('detects integer "%s"', (input, expected) => {
        const result = detectType(input);
        expect(result.type).toBe('integer');
        expect(result.numericValue).toBe(expected);
    });

    // Float
    it.each([
        ['3.14', 3.14],
        ['-0.5', -0.5],
        ['.25', 0.25],
    ])('detects float "%s"', (input, expected) => {
        const result = detectType(input);
        expect(result.type).toBe('float');
        expect(result.numericValue).toBeCloseTo(expected);
    });

    // URL
    it.each(['http://example.com', 'https://example.com/path?q=1'])('detects url "%s"', (input) => {
        const result = detectType(input);
        expect(result.type).toBe('url');
        expect(result.numericValue).toBeNull();
    });

    // Text (fallback)
    it.each(['hello', 'abc123', 'not a number', '=SUM(A1)'])('detects text "%s"', (input) => {
        const result = detectType(input);
        expect(result.type).toBe('text');
        expect(result.numericValue).toBeNull();
    });
});

// ── isNumericType / isCurrencyType ───────────────────────────────────────────

describe('isNumericType', () => {
    it.each(['integer', 'float', 'percent', 'currency_eur', 'currency_usd'] as CellDataType[])(
        'returns true for %s',
        (t) => {
            expect(isNumericType(t)).toBe(true);
        },
    );

    it.each(['text', 'boolean', 'url', 'empty'] as CellDataType[])('returns false for %s', (t) => {
        expect(isNumericType(t)).toBe(false);
    });
});

describe('isCurrencyType', () => {
    it('returns true for currency_eur', () => expect(isCurrencyType('currency_eur')).toBe(true));
    it('returns true for currency_usd', () => expect(isCurrencyType('currency_usd')).toBe(true));
    it('returns false for float', () => expect(isCurrencyType('float')).toBe(false));
});

// ── resolveType ──────────────────────────────────────────────────────────────

describe('resolveType', () => {
    it('takes the other type when one is empty', () => {
        expect(resolveType('empty', 'integer')).toBe('integer');
        expect(resolveType('float', 'empty')).toBe('float');
    });

    it('returns null when text meets numeric', () => {
        expect(resolveType('text', 'integer')).toBeNull();
        expect(resolveType('float', 'text')).toBeNull();
    });

    it('returns null when url meets numeric', () => {
        expect(resolveType('url', 'integer')).toBeNull();
    });

    it('keeps same numeric type', () => {
        expect(resolveType('integer', 'integer')).toBe('integer');
        expect(resolveType('currency_eur', 'currency_eur')).toBe('currency_eur');
    });

    it('promotes integer + float to float', () => {
        expect(resolveType('integer', 'float')).toBe('float');
        expect(resolveType('float', 'integer')).toBe('float');
    });

    it('first currency wins in mixed currency', () => {
        expect(resolveType('currency_usd', 'currency_eur')).toBe('currency_usd');
        expect(resolveType('currency_eur', 'currency_usd')).toBe('currency_eur');
    });

    it('promotes boolean + numeric to the numeric type', () => {
        expect(resolveType('boolean', 'integer')).toBe('integer');
        expect(resolveType('float', 'boolean')).toBe('float');
    });

    it('keeps both booleans as boolean', () => {
        expect(resolveType('boolean', 'boolean')).toBe('boolean');
    });
});

// ── resolveTypeList ──────────────────────────────────────────────────────────

describe('resolveTypeList', () => {
    it('returns empty for an empty list', () => {
        expect(resolveTypeList([])).toBe('empty');
    });

    it('skips empties and returns the remaining type', () => {
        expect(resolveTypeList(['empty', 'integer', 'empty'])).toBe('integer');
    });

    it('returns null when incompatible types are mixed', () => {
        expect(resolveTypeList(['integer', 'text'])).toBeNull();
    });

    it('promotes through a list of compatible types', () => {
        expect(resolveTypeList(['integer', 'float', 'integer'])).toBe('float');
    });
});

// ── formatValue ──────────────────────────────────────────────────────────────

describe('formatValue', () => {
    it('returns empty string for null', () => {
        expect(formatValue(null, 'integer')).toBe('');
    });

    it('formats integer', () => {
        expect(formatValue(42, 'integer')).toBe('42');
        expect(formatValue(3.7, 'integer')).toBe('4');
    });

    it('formats float with default precision', () => {
        expect(formatValue(3.14, 'float')).toBe('3.14');
        expect(formatValue(5, 'float')).toBe('5.0');
    });

    it('formats float with custom decimal places', () => {
        expect(formatValue(3.14159, 'float', 2)).toBe('3.14');
    });

    it('formats currency_usd', () => {
        expect(formatValue(1234.5, 'currency_usd')).toBe('$1,234.50');
        expect(formatValue(-50, 'currency_usd')).toBe('-$50.00');
    });

    it('formats percent', () => {
        expect(formatValue(0.5, 'percent')).toBe('50%');
        expect(formatValue(0.125, 'percent')).toBe('12.5%');
    });

    it('formats boolean', () => {
        expect(formatValue(1, 'boolean')).toBe('TRUE');
        expect(formatValue(0, 'boolean')).toBe('FALSE');
    });
});

// ── formatCellDisplay ────────────────────────────────────────────────────────

describe('formatCellDisplay', () => {
    it('passes through text values', () => {
        expect(formatCellDisplay('hello', 'text')).toBe('hello');
    });

    it('passes through error strings', () => {
        expect(formatCellDisplay('#DIV/0!', 'integer')).toBe('#DIV/0!');
    });

    it('returns empty string for null/empty', () => {
        expect(formatCellDisplay(null, 'empty')).toBe('');
    });

    it('formats numeric values according to type', () => {
        expect(formatCellDisplay(42, 'integer')).toBe('42');
        expect(formatCellDisplay(0.5, 'percent')).toBe('50%');
    });
});

// ── getTypeAlignment ─────────────────────────────────────────────────────────

describe('getTypeAlignment', () => {
    it('right-aligns numeric types', () => {
        expect(getTypeAlignment('integer')).toBe('right');
        expect(getTypeAlignment('currency_usd')).toBe('right');
    });

    it('centers booleans', () => {
        expect(getTypeAlignment('boolean')).toBe('center');
    });

    it('left-aligns text and urls', () => {
        expect(getTypeAlignment('text')).toBe('left');
        expect(getTypeAlignment('url')).toBe('left');
    });
});

// ── getTypeLabel ─────────────────────────────────────────────────────────────

describe('getTypeLabel', () => {
    it('returns human-readable labels', () => {
        expect(getTypeLabel('integer')).toBe('Integer');
        expect(getTypeLabel('currency_eur')).toBe('Euro (€)');
        expect(getTypeLabel('percent')).toBe('Percent (%)');
        expect(getTypeLabel('empty')).toBe('Empty');
    });
});

// ── coerceToType ─────────────────────────────────────────────────────────────

describe('coerceToType', () => {
    it('returns same value when types match', () => {
        const result = coerceToType(42, 'integer', 'integer');
        expect(result).not.toBeNull();
        expect(result!.numericValue).toBe(42);
    });

    it('converts numeric to numeric', () => {
        const result = coerceToType(42, 'integer', 'currency_usd');
        expect(result).not.toBeNull();
        expect(result!.numericValue).toBe(42);
        expect(result!.display).toBe('$42.00');
    });

    it('converts text to numeric when parseable', () => {
        const result = coerceToType('3.14', 'text', 'float');
        expect(result).not.toBeNull();
        expect(result!.numericValue).toBeCloseTo(3.14);
    });

    it('returns null for unparseable text to numeric', () => {
        const result = coerceToType('abc', 'text', 'integer');
        expect(result).toBeNull();
    });

    it('converts numeric to text', () => {
        const result = coerceToType(42, 'integer', 'text');
        expect(result).not.toBeNull();
        expect(result!.display).toBe('42');
    });
});
