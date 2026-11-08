/**
 * cellTypes — type detection, formatting, and hierarchy for cell values.
 * Owns: CellDataType, detectType, formatCellDisplay, resolveType, getTypeLabel, isCheckedValue.
 * Does NOT own: formula parsing (parser.ts), evaluation (evaluator.ts).
 */

import { formatDate, parseDate } from '@/renderer/composables/spreadsheet/engine/dates';

export type CellDataType =
    | 'integer'
    | 'float'
    | 'percent'
    | 'currency_eur'
    | 'currency_usd'
    | 'date'
    | 'text'
    | 'boolean'
    | 'checkbox'
    | 'rating'
    | 'url'
    | 'empty';

type TypedValue = {
    type: CellDataType;
    numericValue: number | null; // underlying number (null for text/empty)
    rawInput: string; // what the user originally typed
};

/** Decimals a number shows until the cell is given its own with the toolbar buttons. */
export const DEFAULT_DECIMAL_PLACES = 2;

// Currency regex patterns
const CURRENCY_USD_PATTERNS = [
    // $1,234.56  or  $1234.56  or  $1234  or  -$12.50
    /^-?\$[\d,]+(?:\.\d+)?$/,
    // 1,234.56$  or  1234.56$
    /^-?[\d,]+(?:\.\d+)?\$$/,
];

// Matches strings that start with http:// or https://
const URL_PATTERN = /^https?:\/\/.+/i;

const CURRENCY_EUR_PATTERNS = [
    // €1.234,56  or  €1234,56  or  €1234  or  -€12,50
    // Also handle €12.50 (dot as decimal, no thousands)
    /^-?€[\d.,]+$/,
    // 1.234,56€  or  1234,56€  or  12,50€
    /^-?[\d.,]+€$/,
];

// Detect the type of a raw input string and extract its components.
export function detectType(raw: string): TypedValue {
    if (raw === '') {
        return { type: 'empty', numericValue: null, rawInput: '' };
    }

    const trimmed = raw.trim();

    // Boolean
    if (trimmed.toLowerCase() === 'true') {
        return { type: 'boolean', numericValue: 1, rawInput: trimmed };
    }
    if (trimmed.toLowerCase() === 'false') {
        return { type: 'boolean', numericValue: 0, rawInput: trimmed };
    }

    // Currency USD
    for (const pat of CURRENCY_USD_PATTERNS) {
        if (pat.test(trimmed)) {
            const num = parseCurrencyUSD(trimmed);
            if (num !== null) {
                return { type: 'currency_usd', numericValue: num, rawInput: trimmed };
            }
        }
    }

    // Currency EUR
    for (const pat of CURRENCY_EUR_PATTERNS) {
        if (pat.test(trimmed)) {
            const num = parseCurrencyEUR(trimmed);
            if (num !== null) {
                return { type: 'currency_eur', numericValue: num, rawInput: trimmed };
            }
        }
    }

    // Percentage (e.g. 50%, 12.5%, -3%)
    if (/^-?\d+(\.\d+)?%$/.test(trimmed)) {
        const num = parseFloat(trimmed) / 100;
        if (!isNaN(num)) {
            return { type: 'percent', numericValue: num, rawInput: trimmed };
        }
    }

    // Integer (no decimal point, no leading zeros except "0" itself)
    if (/^-?\d+$/.test(trimmed)) {
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed)) {
            return { type: 'integer', numericValue: parsed, rawInput: trimmed };
        }
    }

    // Float
    if (/^-?\d+\.\d+$/.test(trimmed) || /^-?\.\d+$/.test(trimmed)) {
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed)) {
            return { type: 'float', numericValue: parsed, rawInput: trimmed };
        }
    }

    // Date (2026-03-04, or 04/03/2026 in the locale's day/month order), held
    // as its serial number
    const serial = parseDate(trimmed);
    if (serial !== null) {
        return { type: 'date', numericValue: serial, rawInput: trimmed };
    }

    // URL (http:// or https://)
    if (URL_PATTERN.test(trimmed)) {
        return { type: 'url', numericValue: null, rawInput: trimmed };
    }

    // Anything else is text
    return { type: 'text', numericValue: null, rawInput: trimmed };
}

/**
 * Returns true if the type is numeric (can participate in arithmetic). A date
 * is: it is a count of days, so a date plus 7 is a week later.
 */
export function isNumericType(t: CellDataType): boolean {
    return (
        t === 'integer' ||
        t === 'float' ||
        t === 'percent' ||
        t === 'currency_eur' ||
        t === 'currency_usd' ||
        t === 'date'
    );
}

/**
 * A control is only how a value is shown: a checkbox is a TRUE/FALSE and a
 * star rating a whole number, so formulas read them as those. Without this,
 * `=A1` on a checkbox would inherit the box and draw one nobody can click.
 */
export function toFormulaType(t: CellDataType): CellDataType {
    if (t === 'checkbox') return 'boolean';
    if (t === 'rating') return 'integer';
    return t;
}

/**
 * Whether a TRUE/FALSE or checkbox cell reads as ticked. The value is not
 * always a JS boolean: typing TRUE stores 1, and a formula result or an
 * imported file can leave a 0/1 or a string behind.
 */
export function isCheckedValue(value: unknown): boolean {
    if (value === null || value === undefined || value === false || value === 0 || value === '') return false;
    return !Number.isNaN(value);
}

/**
 * The type of a TRUE/FALSE once arithmetic has used it: a count. Kept as
 * boolean, `=SUM` over seven ticked boxes would compute 7 and show TRUE.
 */
export function toArithmeticType(t: CellDataType): CellDataType {
    return t === 'boolean' ? 'integer' : t;
}

/**
 * Resolve the result type when two typed values interact in a formula.
 * - first: the left operand / first cell in chain (has priority)
 * - second: the right operand
 *
 * Returns the resolved CellDataType or null if incompatible (→ #N/A).
 */
export function resolveType(first: CellDataType, second: CellDataType): CellDataType | null {
    // If either is empty, take the other
    if (first === 'empty') return second;
    if (second === 'empty') return first;

    // Text/URL mixed with numeric → incompatible for arithmetic
    if (first === 'text' || second === 'text' || first === 'url' || second === 'url') return null;

    if (first === 'boolean' && second === 'boolean') return toArithmeticType(first);

    // Boolean + numeric → promote to the numeric type
    if (first === 'boolean') return second;
    if (second === 'boolean') return first;

    // Both numeric
    if (isNumericType(first) && isNumericType(second)) {
        // Same type → keep it
        if (first === second) return first;

        // If one is currency, the first one's currency wins
        if (isCurrencyType(first)) return first;
        if (isCurrencyType(second)) return second;

        // A date moved by a number of days is still a date. The one exception,
        // date minus date, is a day count; the evaluator handles it.
        if (first === 'date' || second === 'date') return 'date';

        // float vs integer → float
        if (first === 'float' || second === 'float') return 'float';

        return first;
    }

    return null;
}

/**
 * Resolve the result type for a list of types (e.g. SUM of a range).
 * The first non-empty type in the list sets the "target" type.
 */
export function resolveTypeList(types: CellDataType[]): CellDataType | null {
    let result: CellDataType = 'empty';
    for (const candidate of types) {
        if (candidate === 'empty') continue;
        if (result === 'empty') {
            result = candidate;
            continue;
        }
        const resolved = resolveType(result, candidate);
        if (resolved === null) return null;
        result = resolved;
    }
    // A single value never reaches resolveType, so `=SUM(A1)` needs this too
    return toArithmeticType(result);
}

/**
 * Convert a CellValue + CellDataType into a display string.
 */
export function formatCellDisplay(value: unknown, type: CellDataType, decimalPlaces?: number): string {
    if (value === null || value === undefined) return '';

    if (type === 'text' || type === 'url') return toDisplayString(value);
    if (type === 'boolean' || type === 'checkbox') return isCheckedValue(value) ? 'TRUE' : 'FALSE';
    if (type === 'empty') return '';

    if (typeof value === 'number') {
        return formatValue(value, type, decimalPlaces);
    }

    // If it's a string that looks like an error, pass through
    if (typeof value === 'string' && value.startsWith('#')) {
        return value;
    }

    return toDisplayString(value);
}

/**
 * Get the CSS text-align for a cell type.
 */
export function getTypeAlignment(type: CellDataType): 'left' | 'right' | 'center' {
    switch (type) {
        case 'integer':
        case 'float':
        case 'percent':
        case 'currency_eur':
        case 'currency_usd':
        case 'date':
            return 'right';
        case 'boolean':
        case 'checkbox':
        case 'rating':
            return 'center';
        case 'text':
        case 'url':
        default:
            return 'left';
    }
}

/**
 * Get a human-readable label for a cell type.
 */
export function getTypeLabel(type: CellDataType): string {
    switch (type) {
        case 'integer':
            return 'Integer';
        case 'float':
            return 'Decimal';
        case 'percent':
            return 'Percent (%)';
        case 'currency_eur':
            return 'Euro (€)';
        case 'currency_usd':
            return 'Dollar ($)';
        case 'date':
            return 'Date';
        case 'text':
            return 'Text';
        case 'boolean':
            return 'Boolean';
        case 'checkbox':
            return 'Checkbox';
        case 'rating':
            return 'Star rating';
        case 'url':
            return 'URL';
        case 'empty':
            return 'Empty';
    }
}

/**
 * Returns true if the type is a currency type.
 */
function isCurrencyType(t: CellDataType): boolean {
    return t === 'currency_eur' || t === 'currency_usd';
}

/**
 * Format a numeric value according to the given cell type.
 * Internal: `formatCellDisplay` is the entry point callers use.
 */
function formatValue(value: number | null, type: CellDataType, decimalPlaces?: number): string {
    if (value === null) return '';

    switch (type) {
        case 'integer':
            return Math.round(value).toString();

        case 'float': {
            if (decimalPlaces !== undefined) {
                return value.toFixed(decimalPlaces);
            }
            const rounded = parseFloat(value.toFixed(DEFAULT_DECIMAL_PLACES));
            // A decimal keeps its point even when it rounds to a whole number
            if (Number.isInteger(rounded)) return rounded.toFixed(1);
            return rounded.toString();
        }

        case 'currency_usd': {
            const dp = decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
            const abs = Math.abs(value);
            const formatted = abs.toLocaleString('en-US', {
                minimumFractionDigits: dp,
                maximumFractionDigits: dp,
            });
            return value < 0 ? `-$${formatted}` : `$${formatted}`;
        }

        case 'currency_eur': {
            const dp = decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
            const abs = Math.abs(value);
            const formatted = abs.toLocaleString('de-DE', {
                minimumFractionDigits: dp,
                maximumFractionDigits: dp,
            });
            return value < 0 ? `-€${formatted}` : `€${formatted}`;
        }

        case 'percent': {
            const pct = value * 100;
            if (decimalPlaces !== undefined) {
                return `${pct.toFixed(decimalPlaces)}%`;
            }
            return `${parseFloat(pct.toFixed(DEFAULT_DECIMAL_PLACES))}%`;
        }

        case 'boolean':
            return value !== 0 ? 'TRUE' : 'FALSE';

        case 'date':
            return formatDate(value);

        default:
            return value.toString();
    }
}

/**
 * Stringifies a value the display layer received as `unknown`. Plain `String()`
 * would print `[object Object]` for anything structured, which is worse than
 * useless in a cell.
 */
function toDisplayString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return '';
    // Functions and symbols have no JSON form.
    return typeof value === 'object' ? JSON.stringify(value) : '';
}

function parseCurrencyUSD(raw: string): number | null {
    const cleaned = raw.replace(/[$,]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
}

function parseCurrencyEUR(raw: string): number | null {
    // Remove € symbol, then handle European number format
    let cleaned = raw.replace(/€/g, '').trim();

    // Detect European format: dots as thousands, comma as decimal
    // e.g. "1.234,56" → "1234.56"
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned) || /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
        // Simple comma-as-decimal: "12,50" → "12.50"
        cleaned = cleaned.replace(',', '.');
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
}
